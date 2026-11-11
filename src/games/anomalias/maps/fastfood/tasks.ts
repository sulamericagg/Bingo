/* ============================================================
 *  LANCHONETE — tarefas do turno (InteractDef) e seus objetos:
 *  caixas registradoras, chapa, fritadeira, máquina de bebidas,
 *  montagem de lanche, limpeza do derramado, janela do drive-thru.
 *  setState(...) muda o visual; o núcleo faz o minijogo.
 * ============================================================ */
import * as THREE from 'three';
import type { MapCtx } from '../kit2/ctx';
import { bloopProp, car } from '../kit2/props';
import { BLOOP_PALS } from '../kit2/chars';
import { burger3, cup3, fries3 } from '../kit2/food';
import { registerScreen } from './art';

function addTask(ctx: MapCtx, id: string, room: string, kind: string, object: THREE.Object3D, at: [number, number], setState?: (s: string) => void): void {
  object.userData.task = id;
  ctx.interacts.push({ id, room, kind, object, at: { x: at[0], y: 0, z: at[1] }, setState });
}

export function buildTasks(ctx: MapCtx): void {
  // ---------------------------------------------------------------- caixas registradoras
  for (const [i, x] of [5.6, 7.4].entries()) {
    const g = new THREE.Group();
    g.position.set(x, 1.025, 2.0);
    ctx.root.add(g);
    const b = ctx.gb('vc');
    b.box(0.42, 0.1, 0.4, 0, 0, 0, '#2a2a32');
    b.box(0.4, 0.06, 0.3, 0, 0.1, -0.02, '#3a3a44', 0, 0.12);
    for (let k = 0; k < 12; k++) b.box(0.05, 0.015, 0.04, -0.12 + (k % 4) * 0.08, 0.15, -0.1 + Math.floor(k / 4) * 0.06, k === 11 ? '#3ad06a' : '#d8d8e0', 0, 0.12);
    // tela do funcionário (virada para −Z, onde ele fica) e tela do cliente (+Z)
    b.cyl(0.03, 0.03, 0.22, 0, 0.08, 0.06, '#2a2a32', 8);
    b.box(0.38, 0.28, 0.05, 0, 0.27, 0.06, '#1a1a20', 0, 0.22);
    b.box(0.2, 0.16, 0.03, 0, 0.18, 0.2, '#1a1a20');
    ctx.mesh('balcao', b, 'vc', 0, 0, 0, 0, g);
    const staff = ctx.picture('balcao', registerScreen(), 0.33, 0.23, 0, 0.41, 0.02, Math.PI, true, g);
    staff.rotation.x = -0.22;
    const cust = ctx.picture('balcao', registerScreen(), 0.17, 0.13, 0, 0.26, 0.218, 0, true, g);
    ctx.refs.set('regCust' + i, cust);
    ctx.refs.set('register' + i, g);
    addTask(ctx, 'caixa' + (i + 1), 'balcao', 'register', g, [x, 1.2]);
  }

  // ---------------------------------------------------------------- chapa
  {
    const g = new THREE.Group();
    g.position.set(3.1, 0.86, -8.55);
    ctx.root.add(g);
    const b = ctx.gb('steel');
    b.box(2.2, 0.1, 0.8, 0, 0, 0, '#c8ccd2');
    b.box(2.1, 0.03, 0.62, 0, 0.1, 0.02, '#2a2a2e');
    b.box(2.2, 0.25, 0.04, 0, 0.1, -0.38, '#c8ccd2');
    b.box(0.04, 0.25, 0.7, -1.08, 0.1, 0, '#c8ccd2');
    b.box(0.04, 0.25, 0.7, 1.08, 0.1, 0, '#c8ccd2');
    for (let k = 0; k < 4; k++) b.cyl(0.03, 0.03, 0.04, -0.6 + k * 0.4, 0.02, 0.41, '#2a2a2e', 8, Math.PI / 2);
    ctx.mesh('cozinha', b, 'steel', 0, 0, 0, 0, g);
    // carnes (cor muda com o estado)
    const raw = new THREE.MeshLambertMaterial({ color: '#d8706a' });
    const done = new THREE.MeshLambertMaterial({ color: '#7a4228' });
    const burnt = new THREE.MeshLambertMaterial({ color: '#2a1a14' });
    for (const m of [raw, done, burnt]) ctx.adopt('cozinha', m, false, m.color.clone());
    const pg = ctx.track(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 14));
    pg.translate(0, 0.011, 0);
    const patties: THREE.Mesh[] = [];
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(pg, done);
      p.position.set(-0.7 + (k % 3) * 0.32 + Math.floor(k / 3) * 0.75, 0.13, -0.12 + Math.floor(k / 3) * 0.18 - (k % 2) * 0.08);
      g.add(p);
      patties.push(p);
    }
    // espátula
    const sp = ctx.gb('vc');
    sp.box(0.12, 0.005, 0.1, 0.85, 0.13, 0.15, '#c8ccd2');
    sp.box(0.03, 0.02, 0.22, 0.85, 0.135, 0.31, '#2a2a2e', 0, -0.2);
    ctx.mesh('cozinha', sp, 'vc', 0, 0, 0, 0, g);
    ctx.refs.set('grill', g);
    // fumaça (cartões aditivos) quando está fritando
    const smoke = new THREE.Group();
    g.add(smoke);
    const sm = new THREE.MeshBasicMaterial({ color: '#8a8a8a', transparent: true, opacity: 0.25, depthWrite: false });
    ctx.adopt('cozinha', sm, true);
    ctx.track(sm);
    const sg = ctx.track(new THREE.PlaneGeometry(0.4, 0.6));
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(sg, sm);
      s.position.set(-0.6 + k * 0.6, 0.5, 0);
      smoke.add(s);
    }
    let cooking = true;
    ctx.onUpdate((_dt, t) => {
      smoke.visible = cooking;
      if (!cooking) return;
      smoke.children.forEach((s, k) => {
        const f = (t * 0.35 + k * 0.33) % 1;
        s.position.y = 0.25 + f * 0.9;
        s.scale.setScalar(0.6 + f);
        s.rotation.z = Math.sin(t + k) * 0.3;
      });
      sm.opacity = 0.18;
    });
    addTask(ctx, 'chapa', 'cozinha', 'grill', g, [3.1, -7.55], (s) => {
      const m = s === 'raw' ? raw : s === 'burnt' ? burnt : done;
      for (const p of patties) p.material = m;
      cooking = s === 'raw' || s === 'cooking';
      for (const p of patties) p.visible = s !== 'empty';
    });
  }

  // ---------------------------------------------------------------- fritadeira
  {
    const g = new THREE.Group();
    g.position.set(5.0, 0, -8.55);
    ctx.root.add(g);
    const b = ctx.gb('steel');
    b.box(1.15, 0.92, 0.8, 0, 0, 0, '#c8ccd2');
    for (const s of [-1, 1]) {
      b.box(0.48, 0.02, 0.5, s * 0.28, 0.92, 0.04, '#9aa0a8');
      b.box(0.44, 0.01, 0.46, s * 0.28, 0.85, 0.04, '#3a2a10');
    }
    b.box(1.15, 0.3, 0.06, 0, 0.92, -0.37, '#c8ccd2');
    b.box(0.3, 0.12, 0.02, 0, 1.02, -0.33, '#1a1a20');
    ctx.mesh('cozinha', b, 'steel', 0, 0, 0, 0, g);
    // óleo dourado (brilho sutil)
    const oil = ctx.gb('glow');
    for (const s of [-1, 1]) oil.box(0.42, 0.005, 0.44, s * 0.28, 0.88, 0.04, '#7a5a18');
    const oilM = ctx.mesh('cozinha', oil, 'glow', 0, 0, 0, 0, g);
    ctx.g('cozinha', 'glow').box(0.26, 0.08, 0.005, 5.0, 1.04, -8.925, '#ff5a2a');
    // cestos (sobem/descem)
    const baskets: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const bk = new THREE.Group();
      bk.position.set(s * 0.28, 0.82, 0.04);
      g.add(bk);
      const w = ctx.gb('vc');
      w.box(0.36, 0.16, 0.36, 0, 0, 0, '#b8bcc6');
      w.box(0.03, 0.03, 0.4, 0, 0.14, 0.36, '#2a2a2e', 0, -0.35);
      fries3(w, 0, 0.06, 0, 1.8, '#b8bcc6');
      ctx.mesh('cozinha', w, 'vc', 0, 0, 0, 0, bk);
      baskets.push(bk);
    }
    ctx.refs.set('fryer', g);
    ctx.refs.set('fryBasketL', baskets[0]);
    let down = [false, true];
    ctx.onUpdate((_dt, t) => {
      baskets.forEach((bk, i) => {
        const ty = down[i] ? 0.8 : 1.12;
        bk.position.y += (ty - bk.position.y) * 0.15;
      });
      oilM.position.y = Math.sin(t * 17) * 0.002;
    });
    addTask(ctx, 'fritadeira', 'cozinha', 'fryer', g, [5.0, -7.55], (s) => {
      down = s === 'down' ? [true, true] : s === 'up' ? [false, false] : [false, true];
    });
  }

  // ---------------------------------------------------------------- máquina de bebidas (balcão de trás)
  {
    const g = new THREE.Group();
    g.position.set(5.05, 0.94, -1.72);
    ctx.root.add(g);
    const b = ctx.gb('vc');
    b.box(1.3, 0.85, 0.55, 0, 0, 0, '#2a2a32');
    b.box(1.3, 0.12, 0.6, 0, 0.85, 0, '#e8423a');
    b.box(1.2, 0.04, 0.3, 0, 0.02, 0.18, '#8a8e98');
    const cols = ['#3a2210', '#ff8a1a', '#3ad06a', '#ff4a8a'];
    for (let k = 0; k < 4; k++) {
      b.box(0.22, 0.22, 0.04, -0.42 + k * 0.28, 0.5, 0.29, '#3a3a44');
      b.cyl(0.025, 0.02, 0.06, -0.42 + k * 0.28, 0.3, 0.24, '#c8ccd2', 8);
    }
    b.box(0.3, 0.4, 0.06, 0, 0.42, 0.29, '#c8ccd2');
    ctx.mesh('balcao', b, 'vc', 0, 0, 0, 0, g);
    const lbl = ctx.gb('glow');
    for (let k = 0; k < 4; k++) lbl.box(0.18, 0.16, 0.01, -0.42 + k * 0.28, 0.53, 0.315, cols[k]);
    lbl.box(1.1, 0.06, 0.01, 0, 0.87, 0.305, '#fff2d0');
    ctx.mesh('balcao', lbl, 'glow', 0, 0, 0, 0, g);
    // copo + jato (o jato é usado pela anomalia "máquina servindo sozinha")
    const c = ctx.gb('vc');
    c.ao = false;
    cup3(c, 0, 0, 0, 1.3, '#ffffff', '#e8423a');
    const cup = ctx.mesh('balcao', c, 'vc', -0.14, 0.06, 0.18, 0, g);
    cup.visible = false;
    const st = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6)), ctx.mat('balcao', 'glow'));
    ctx.track(st.geometry);
    const sc = new THREE.Color('#5a2a10').convertSRGBToLinear();
    const n = st.geometry.getAttribute('position').count;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (ca[i * 3] = sc.r), (ca[i * 3 + 1] = sc.g), (ca[i * 3 + 2] = sc.b);
    st.geometry.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    st.position.set(-0.14, 0.17, 0.24);
    st.visible = false;
    g.add(st);
    ctx.refs.set('drinkMachine', g);
    ctx.refs.set('drinkCup', cup);
    ctx.refs.set('drinkStream', st);
    addTask(ctx, 'bebidas', 'balcao', 'drink', g, [5.05, -0.9], (s) => {
      cup.visible = s !== 'idle';
      st.visible = s === 'pouring';
    });
  }

  // ---------------------------------------------------------------- montagem (ilha da cozinha)
  {
    const g = new THREE.Group();
    g.position.set(4.0, 0.94, -5.1);
    ctx.root.add(g);
    const b = ctx.gb('vc');
    b.ao = false;
    const ing: [string, string][] = [
      ['#eea24c', 'pão'],
      ['#6a3420', 'carne'],
      ['#ffcc2a', 'queijo'],
      ['#5ac64a', 'alface'],
      ['#e8382a', 'tomate'],
      ['#f2e8f8', 'cebola'],
    ];
    ing.forEach(([col], k) => {
      const x = -1.3 + k * 0.42;
      b.box(0.36, 0.08, 0.32, x, 0, 0.1, '#c8ccd2');
      b.box(0.3, 0.03, 0.26, x, 0.06, 0.1, col);
      for (let j = 0; j < 4; j++) b.sph(0.03, x - 0.1 + (j % 2) * 0.2, 0.09, 0.03 + Math.floor(j / 2) * 0.13, col, 1.4, 0.5, 1.2, 6);
    });
    // bisnagas de molho
    b.cyl(0.035, 0.035, 0.18, 1.3, 0, -0.1, '#e8302a', 10);
    b.cyl(0.035, 0.035, 0.18, 1.4, 0, -0.1, '#ffcc1a', 10);
    // tábua com papel
    b.box(0.5, 0.02, 0.4, 0.9, 0, 0.15, '#fff8e8');
    ctx.mesh('cozinha', b, 'vc', 0, 0, 0, 0, g);
    // lanche sendo montado
    const bb = ctx.gb('vc');
    bb.ao = false;
    burger3(bb, 0, 0, 0, 1.6);
    const stack = ctx.mesh('cozinha', bb, 'vc', 0.9, 0.02, 0.15, 0, g);
    stack.visible = false;
    // tela de pedidos acima
    const scr = ctx.gb('vc');
    scr.box(0.7, 0.42, 0.05, 0, 0.75, -0.42, '#1a1a20');
    scr.cyl(0.02, 0.02, 0.75, 0, 0, -0.42, '#8a8e98', 6);
    ctx.mesh('cozinha', scr, 'vc', 0, 0, 0, 0, g);
    ctx.g('cozinha', 'glow').box(0.64, 0.36, 0.01, 4.0, 0.94 + 0.78, -5.1 - 0.39, '#2a5a9a');
    addTask(ctx, 'montagem', 'cozinha', 'assemble', g, [4.0, -4.15], (s) => (stack.visible = s === 'building' || s === 'done'));
    ctx.refs.set('assembly', g);
  }

  // ---------------------------------------------------------------- limpeza (refri derramado no salão)
  {
    const g = new THREE.Group();
    g.position.set(-1.4, 0, 3.0);
    ctx.root.add(g);
    // poça (decalque)
    const pg = new THREE.CircleGeometry(0.55, 20);
    pg.rotateX(-Math.PI / 2);
    pg.scale(1, 1, 0.7);
    const pc = new THREE.Color('#6a3410');
    const n = pg.getAttribute('position').count;
    const ca = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) (ca[i * 3] = pc.r), (ca[i * 3 + 1] = pc.g), (ca[i * 3 + 2] = pc.b);
    pg.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    const pm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    ctx.adopt('salao', pm);
    const puddle = new THREE.Mesh(ctx.track(pg), pm);
    puddle.position.y = 0.004;
    puddle.renderOrder = 2;
    g.add(puddle);
    ctx.bakeMesh('salao', puddle);
    // copo caído e placa de "piso molhado"
    const b = ctx.gb('vc');
    b.ao = false;
    cup3(b, 0, 0, 0, 1.3, '#ffffff', '#3aa0ff');
    const cup = ctx.mesh('salao', b, 'vc', 0.45, 0.045, 0.1, 0, g);
    cup.rotation.z = Math.PI / 2;
    const sg = ctx.gb('vc');
    sg.box(0.32, 0.6, 0.03, 0, 0, 0.09, '#ffd23a', 0, -0.28);
    sg.box(0.32, 0.6, 0.03, 0, 0, -0.09, '#ffd23a', 0, 0.28);
    sg.box(0.2, 0.18, 0.005, 0, 0.25, 0.135, '#2a2a30', 0, -0.28);
    const sign = ctx.mesh('salao', sg, 'vc', -0.75, 0, -0.5, 0.5, g);
    ctx.refs.set('spill', g);
    addTask(ctx, 'limpeza', 'salao', 'clean', g, [-1.4, 2.0], (s) => {
      const dirty = s !== 'clean';
      puddle.visible = dirty;
      cup.visible = dirty;
      sign.visible = dirty;
    });
  }

  // ---------------------------------------------------------------- drive-thru (janela + carro com cliente)
  {
    const win = new THREE.Group();
    win.position.set(12, 0.95, -0.85);
    ctx.root.add(win);
    const w = ctx.gb('vc');
    w.box(0.05, 1.0, 0.06, 0, 0, 0.03, '#3a3a46');
    w.box(0.05, 1.0, 0.06, 0, 0, 1.07, '#3a3a46');
    w.box(0.05, 0.06, 1.1, 0, 0, 0.55, '#3a3a46');
    w.box(0.05, 0.06, 1.1, 0, 0.94, 0.55, '#3a3a46');
    ctx.mesh('drive', w, 'vc', 0, 0, 0, 0, win);
    const gl = ctx.gb('glass');
    gl.sharp(0.01, 0.9, 1.0, 0, 0.05, 0.55, '#33405a');
    ctx.mesh('drive', gl, 'glass', 0, 0, 0, 0, win).renderOrder = 5;
    ctx.refs.set('driveWindow', win);
    // carro da fila do drive com Bloop motorista
    const carG = car(ctx, 'estac', '#e8a02a', 13.75, -0.6, Math.PI, 'hatch', true);
    const drv = bloopProp(ctx, 'estac', BLOOP_PALS[4], 13.35, 0.42, -0.85, -Math.PI / 2, 0.95, 'beanie', 'sit');
    carG.attach(drv.mesh);
    drv.mesh.userData.faces = drv.faces;
    ctx.refs.set('driveCar', carG);
    ctx.refs.set('driveDriver', drv.mesh);
    ctx.box(12.8, -2.6, 14.7, 1.4, 0, 1.7);
    addTask(ctx, 'drive', 'drive', 'drivethru', win, [11.4, -0.3], (s) => {
      carG.visible = s !== 'empty';
    });
  }
}
