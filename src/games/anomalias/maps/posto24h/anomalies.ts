/* ============================================================
 *  POSTO 24h — pontos de anomalia (35+). Mesmo esquema da Lanchonete:
 *  variações baratas (visibilidade, transformação, geometria já assada,
 *  textura, luz da sala, animação).
 * ============================================================ */
import * as THREE from 'three';
import type { GeoBuilder } from '../../../../3d/common/geo';
import { A, addSlot, anim, buzz, type MapCtx } from '../kit2/ctx';
import { BLOOP_PALS } from '../kit2/chars';
import { bloopProp, car, sombrito, trashBin } from '../kit2/props';
import { bloopSlot, colorVariants, creatures, motion, roomLightFn } from '../kit2/slots';
import { atmScreen, postoCams, priceSign, pumpScreen, storePoster, TEAL, TEAL_D, SUN } from './art';
import { clockFace, mirrorTex as mirrorTexP } from '../fastfood/art';
import { GONDOLAS, LEVELS, SHELF_SLOTS, productRow, PRODUCT_COLS } from './store';
import { NOZZLE, PUMPS } from './outside';

export function buildAnomalies(ctx: MapCtx): void {
  const P = BLOOP_PALS;
  const track = <T extends THREE.Texture>(t: T) => ctx.track(t);

  // ================================================================ PÁTIO
  // 1 carro que não estava lá
  {
    const cars = [car(ctx, 'patio', '#d8dce4', 6.6, -10.2, Math.PI, 'van'), car(ctx, 'patio', '#e8a02a', 10.0, -6.0, Math.PI * 0.8, 'pickup'), car(ctx, 'estrada', '#c8c8d0', -8, -27.3, Math.PI / 2, 'hatch')];
    addSlot(ctx, 'carro_novo', 'patio', cars[0], { extra: A.show(cars) }, 3);
  }
  // 2 mangueira da bomba levantada
  {
    const [x, z] = PUMPS[3];
    const hose = (pts: [number, number, number][], nozzle: [number, number, number, number]) => {
      const g = ctx.gb('vc');
      g.ao = false;
      g.tube(pts, 0.022, '#1a1a1e', 12, 5);
      const [nx, ny, nz, rz] = nozzle;
      g.box(0.06, 0.06, 0.24, nx, ny, nz, NOZZLE[0], 0, 0, rz);
      g.cyl(0.012, 0.012, 0.14, nx, ny + 0.02, nz + 0.12, '#c8ccd2', 6, Math.PI / 2);
      return g.build();
    };
    const base = hose(
      [
        [x + 0.2, 2.08, z],
        [x + 0.55, 1.6, z + 0.1],
        [x + 0.6, 0.6, z + 0.2],
        [x + 0.43, 0.6, z],
      ],
      [x + 0.45, 0.66, z - 0.15, 0],
    );
    const m = ctx.mesh('patio', base, 'vc');
    const lifted = ctx.bakeAs(
      'patio',
      m,
      hose(
        [
          [x + 0.2, 2.08, z],
          [x + 0.8, 1.9, z + 0.3],
          [x + 1.2, 1.6, z + 0.6],
        ],
        [x + 1.25, 1.55, z + 0.62, 0.3],
      ),
    );
    const floor = ctx.bakeAs(
      'patio',
      m,
      hose(
        [
          [x + 0.2, 2.08, z],
          [x + 0.7, 1.0, z + 0.4],
          [x + 1.1, 0.25, z + 1.0],
          [x + 1.4, 0.24, z + 1.6],
        ],
        [x + 1.45, 0.25, z + 1.75, 0],
      ),
    );
    addSlot(ctx, 'mangueira', 'patio', m, { move: A.geo(m, [lifted, floor]), missing: A.hide(m) }, 2);
  }
  // 3 tela da bomba
  {
    const [x, z] = PUMPS[3];
    const scr = ctx.picture('patio', pumpScreen(), 0.28, 0.24, x + 0.398, 1.38, z, Math.PI / 2, true);
    addSlot(ctx, 'bomba_tela', 'patio', scr, {
      picture: A.tex(scr.material as THREE.MeshBasicMaterial, [0, 1].map((v) => track(pumpScreen(v)))),
      light: A.hide(scr),
    }, 2);
  }
  // 4 placa de preços (números trocados)
  {
    const s1 = ctx.refs.get('price') as THREE.Mesh;
    const s2 = ctx.refs.get('price2') as THREE.Mesh;
    const m1 = s1.material as THREE.MeshBasicMaterial;
    const m2 = s2.material as THREE.MeshBasicMaterial;
    const v = [0, 1, 2].map((i) => track(priceSign(i)));
    let mode = 0;
    ctx.onUpdate((_dt, t) => {
      if (mode !== 1) return;
      const k = Math.sin(t * 17) * Math.sin(t * 4.3) > 0.2 ? 0.1 : 1;
      m1.color.setScalar(k);
      m2.color.setScalar(k);
    });
    addSlot(ctx, 'preco', 'patio', s1, {
      picture: A.all(A.tex(m1, v), A.tex(m2, v)),
      light: (on, vv) => {
        mode = on ? (vv % 2 ? 2 : 1) : 0;
        const k = mode === 2 ? 0.06 : 1;
        m1.color.setScalar(k);
        m2.color.setScalar(k);
      },
    });
  }
  // 5 luzes da cobertura
  {
    const o = new THREE.Object3D();
    o.position.set(0, 4.9, -11);
    ctx.root.add(o);
    addSlot(ctx, 'luz_cobertura', 'patio', o, { light: roomLightFn(ctx, 'patio') }, 4);
  }
  // 6 lixeira da ilha (criatura espiando)
  {
    const g = ctx.gb('vc');
    trashBin(g, 0, 0, TEAL_D);
    const m = ctx.mesh('patio', g, 'vc', -3.5, 0.18, -14.6);
    ctx.boxAt(-3.5, -14.6, 0.5, 0.5, 0, 1.2);
    const cr = sombrito(ctx, 'patio', -3.5, 0.8, -14.6, -Math.PI / 2, 0.6);
    addSlot(ctx, 'lixeira_ilha', 'patio', m, {
      creature: A.show([cr]),
      sound: buzz(ctx, m, 0.015, 'rattle'),
      move: A.move(m, [
        [-2.0, -0.18, 2.0, 0.6],
        [3.0, -0.18, 6.0, 0],
      ]),
    });
  }
  // 7 balde com rodo
  {
    const mk = (g: GeoBuilder) => {
      g.cyl(0.16, 0.13, 0.32, 0, 0, 0, '#2a6ad8', 12);
      g.cyl(0.012, 0.012, 0.8, 0.05, 0.04, 0, '#8a6a4a', 6, 0, 0.2);
      g.box(0.32, 0.04, 0.05, 0.21, 0.8, 0, '#2a2a30', 0, 0, 0.2);
    };
    const g = ctx.gb('vc');
    mk(g);
    const m = ctx.mesh('patio', g, 'vc', 3.5, 0.26, -7.1);
    const g2 = ctx.gb('vc');
    mk(g2);
    const m2 = ctx.mesh('patio', g2, 'vc', 3.5, 2.36, -9.0);
    addSlot(ctx, 'balde', 'patio', m, {
      move: A.move(m, [
        [-3.3, -0.26, -1.6, 0],
        [3.2, -0.26, 4.6, 1],
      ]),
      missing: A.hide(m),
      extra: A.show([m2]),
    });
  }
  // 8 cone na entrada do lava-jato
  {
    const mk = (g: GeoBuilder, c: string) => {
      g.box(0.38, 0.04, 0.38, 0, 0, 0, '#2a2a30');
      g.cyl(0.03, 0.15, 0.62, 0, 0.04, 0, c, 12);
      g.cyl(0.075, 0.105, 0.1, 0, 0.3, 0, '#f2f2f2', 12);
    };
    const g = ctx.gb('vc');
    mk(g, '#ff6a1a');
    const m = ctx.mesh('patio', g, 'vc', -17.5, 0, -11.6);
    const blue = colorVariants(ctx, 'patio', m, 'vc', ['#2a6ad8', '#9a4aff'], mk);
    const row: THREE.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const gg = ctx.gb('vc');
      mk(gg, '#ff6a1a');
      row.push(ctx.mesh('patio', gg, 'vc', -20.0 + i * 1.0, 0, -11.6));
    }
    const rowG = new THREE.Group();
    ctx.roomGroup('patio').add(rowG);
    for (const r of row) rowG.add(r);
    addSlot(ctx, 'cone', 'patio', m, {
      move: A.move(m, [
        [17.5, 5.6, -5.9, 0],
        [12.0, 0, -15.5, 0],
      ]),
      color: A.geo(m, blue),
      extra: A.show([rowG]),
    });
  }
  // 9 vulto (estrada, poste, vitrine, teto da cobertura)
  {
    const cr = creatures(ctx, 'patio', [
      [1.5, -0.02, -26.6, 0, 1.8],
      [14.2, -0.02, -23.4, 0.3, 1.3],
      [-6.4, 0.1, 1.15, Math.PI, 1.25],
      [2.0, 5.36, -17.4, 0, 1.0],
    ]);
    addSlot(ctx, 'vulto', 'patio', cr[0], { creature: A.show(cr) }, 4);
  }
  // 10 orelhão (tocando, cor, fone pendurado)
  {
    const x = 11.0;
    const z = 1.6;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    ctx.roomGroup('patio').add(g);
    const shell = (c: string) => {
      const b = ctx.gb('vc');
      b.sph(0.55, 0, 2.05, 0.05, c, 1, 0.9, 0.85, 14);
      return b;
    };
    const sm = ctx.mesh('patio', shell('#ff8a1a'), 'vc', 0, 0, 0, 0, g);
    const vars = colorVariants(ctx, 'patio', sm, 'vc', ['#3a6ad8', '#8a3ad8'], (b, c) => b.sph(0.55, 0, 2.05, 0.05, c, 1, 0.9, 0.85, 14));
    const rc = ctx.gb('vc');
    rc.box(0.06, 0.26, 0.07, 0, 0, 0, '#2a2a30');
    rc.sph(0.05, 0, 0.14, 0.02, '#2a2a30', 1, 0.7, 1, 8);
    rc.sph(0.05, 0, -0.14, 0.02, '#2a2a30', 1, 0.7, 1, 8);
    const rec = ctx.mesh('patio', rc, 'vc', -0.14, 1.45, -0.21, 0, g);
    g.userData.soundHint = 'phone';
    addSlot(ctx, 'orelhao', 'patio', g, {
      sound: buzz(ctx, rec, 0.02, 'phone'),
      color: A.geo(sm, vars),
      move: A.move(rec, [[0.0, -0.8, -0.1, 0.4]]),
    });
  }
  // 11 boneco inflável (dança sempre; anomalia: murcho, cor, sumiu, no meio da estrada)
  {
    const piv = new THREE.Group();
    piv.position.set(8.5, 0, -21.5);
    ctx.roomGroup('patio').add(piv);
    const base = ctx.gb('vc');
    base.cyl(0.35, 0.4, 0.5, 0, 0, 0, '#2a2a30', 14);
    ctx.mesh('patio', base, 'vc', 0, 0, 0, 0, piv);
    const body = new THREE.Group();
    body.position.y = 0.5;
    piv.add(body);
    const mk = (b: GeoBuilder, c: string) => {
      b.cyl(0.22, 0.25, 2.6, 0, 0, 0, c, 12);
      b.sph(0.32, 0, 2.85, 0, c, 1, 1.05, 1, 14);
      b.sph(0.08, -0.12, 2.95, 0.27, '#ffffff', 1, 1.2, 0.6, 8);
      b.sph(0.08, 0.12, 2.95, 0.27, '#ffffff', 1, 1.2, 0.6, 8);
      b.sph(0.035, -0.12, 2.95, 0.32, '#2a1140', 1, 1, 0.6, 6);
      b.sph(0.035, 0.12, 2.95, 0.32, '#2a1140', 1, 1, 0.6, 6);
      b.torus(0.09, 0.02, 0, 2.78, 0.3, '#2a1140', Math.PI, 10, 0, Math.PI);
      for (const s of [-1, 1]) b.cyl(0.08, 0.1, 1.1, s * 0.25, 1.9, 0, c, 8, 0, s * -1.1);
    };
    const bb = ctx.gb('vc');
    mk(bb, SUN);
    const bm = ctx.mesh('patio', bb, 'vc', 0, 0, 0, 0, body);
    const cvars = colorVariants(ctx, 'patio', bm, 'vc', ['#2a2a30', '#e8302a'], mk);
    let limp = false;
    ctx.onUpdate((_dt, t) => {
      if (limp) {
        body.rotation.set(1.35, 0, 0.2);
        body.scale.set(1, 0.85, 1);
        return;
      }
      body.rotation.set(Math.sin(t * 2.3) * 0.18, 0, Math.sin(t * 3.1) * 0.22 + Math.sin(t * 7.7) * 0.05);
      body.scale.set(1, 1, 1);
    });
    ctx.boxAt(8.5, -21.5, 0.8, 0.8, 0, 2);
    addSlot(ctx, 'boneco', 'patio', piv, {
      rotate: (on) => (limp = on),
      color: A.geo(bm, cvars),
      missing: A.hide(piv),
      move: A.move(piv, [
        [-6.5, 0, -9.0, 0],
        [-20, 0, 6, 0],
      ]),
    });
  }

  // ================================================================ LOJA
  // 12-15 trechos de prateleira (bagunçados, faltando, de cabeça pra baixo, cor errada)
  SHELF_SLOTS.forEach(([gi, side, lv, z0, z1], i) => {
    const gx = GONDOLAS[gi];
    const kind = lv === 0 ? 0 : lv === 1 ? 1 : lv === 2 ? 2 : 3;
    const cols = [PRODUCT_COLS[(i * 3) % 10], PRODUCT_COLS[(i * 3 + 1) % 10], PRODUCT_COLS[(i * 3 + 4) % 10]];
    const mk = (g: GeoBuilder, o: { cols?: string[]; flip?: boolean; shuffle?: boolean }) => {
      const deep = kind >= 2 ? 2 : 1;
      for (let d = 0; d < deep; d++) {
        const x = gx + side * (0.33 - d * 0.12);
        if (o.shuffle) {
          productRow(g, (kind + 1 + d) % 4, x, LEVELS[lv], z0, z1, (o.cols ?? cols).slice().reverse(), false, 3);
        } else productRow(g, kind, x, LEVELS[lv], z0, z1, o.cols ?? cols, !!o.flip, 0);
      }
    };
    const g = ctx.gb('vc');
    g.ao = false;
    mk(g, {});
    const m = ctx.mesh('loja', g, 'vc');
    const v = colorVariants(ctx, 'loja', m, 'vc', [{ shuffle: true }, { flip: true }, { cols: ['#1a1a20'] }, { cols: ['#ff2a6a', '#ff2a6a'] }], mk);
    addSlot(ctx, ['prateleira_a', 'prateleira_b', 'prateleira_c', 'prateleira_d'][i], 'loja', m, {
      move: A.geo(m, [v[0]]),
      rotate: A.geo(m, [v[1]]),
      color: A.geo(m, [v[2], v[3]]),
      missing: A.hide(m),
    });
  });
  // 16 luz das geladeiras
  {
    const fm = ctx.refs.get('fridgeLight') as THREE.Mesh;
    const mat = fm.material as THREE.MeshBasicMaterial;
    let flick = false;
    ctx.onUpdate((_dt, t) => {
      if (flick) mat.color.setScalar(Math.sin(t * 29) * Math.sin(t * 6) > 0.3 ? 0.15 : 1);
    });
    addSlot(ctx, 'geladeira_luz', 'loja', fm, {
      color: (on, v) => {
        mat.userData.baseCol = on ? new THREE.Color(['#ff4a4a', '#4aff8a', '#b04aff'][v % 3]) : undefined;
        mat.color.set(on ? ['#ff4a4a', '#4aff8a', '#b04aff'][v % 3] : '#ffffff');
      },
      light: (on, v) => {
        flick = on && v % 2 === 0;
        mat.color.setScalar(on && v % 2 === 1 ? 0.08 : 1);
      },
    });
  }
  // 17 porta da geladeira aberta
  {
    const x0 = -9.6 + 2 * 1.3;
    const piv = new THREE.Group();
    piv.position.set(x0 + 0.05, 0.12, 15.12);
    ctx.roomGroup('loja').add(piv);
    const fr = ctx.gb('vc');
    fr.box(1.2, 0.05, 0.05, 0.6, 0, 0, '#c8ccd2');
    fr.box(1.2, 0.05, 0.05, 0.6, 1.73, 0, '#c8ccd2');
    fr.box(0.05, 1.78, 0.05, 1.18, 0, 0, '#c8ccd2');
    fr.box(0.03, 0.5, 0.04, 1.08, 0.68, -0.04, '#e8ecef');
    ctx.mesh('loja', fr, 'vc', 0, 0, 0, 0, piv);
    const gl = ctx.gb('glass');
    gl.sharp(1.12, 1.7, 0.01, 0.6, 0.04, 0, '#a8c8e8');
    ctx.mesh('loja', gl, 'glass', 0, 0, 0, 0, piv).renderOrder = 5;
    addSlot(ctx, 'geladeira_porta', 'loja', piv, {
      door: A.rot(piv, [
        [0, 1.3, 0],
        [0, 0.5, 0],
      ]),
      sound: buzz(ctx, piv, 0.004, 'hum'),
    });
  }
  // 18 máquina de café sozinha
  {
    const g = ctx.refs.get('coffee')!;
    const cup = ctx.refs.get('coffeeCup')!;
    const st = ctx.refs.get('coffeeStream')!;
    const pour = anim(ctx, st, (o, t) => (o.scale.y = 0.9 + Math.sin(t * 40) * 0.1));
    addSlot(ctx, 'cafe', 'loja', g, {
      sound: (on, v) => {
        pour(on, v);
        st.visible = on;
        cup.visible = on;
      },
      move: A.move(g, [[0, 0, 0.9, 0.5]]),
      rotate: A.rot(g, [[0, Math.PI, 0]]),
    });
  }
  // 19 caixa (tela do cliente com rosto)
  {
    const reg = ctx.refs.get('register')!;
    const scr = ctx.refs.get('regCust') as THREE.Mesh;
    addSlot(ctx, 'caixa', 'loja', reg, {
      picture: A.tex(scr.material as THREE.MeshBasicMaterial, [track(atmScreen(0)), track(atmScreen(2))]),
      rotate: A.rot(reg, [[0, Math.PI, 0]]),
      move: A.move(reg, [[0, 0, 1.6, 0.4]]),
    });
  }
  // 20 cliente na loja
  bloopSlot(ctx, 'cliente_loja', 'loja', P[2], [-0.35, 0, 9.2, Math.PI / 2], {
    scale: 1.35,
    hat: 'beanie',
    kinds: ['face', 'missing', 'rotate', 'scale', 'color', 'move'],
    move: [
      [-2.4, 0, -6.0, 0],
      [0, 1.06, -3.5, 0],
    ],
  });
  // 21 cliente a mais (geladeira, ATRÁS do balcão, lá fora olhando a vitrine)
  {
    const ex = [
      bloopProp(ctx, 'loja', P[5], -6.0, 0, 14.4, Math.PI, 1.35, 'cap', 'stand').mesh,
      bloopProp(ctx, 'loja', P[1], 2.5, 0, 3.4, -Math.PI / 2, 1.3, '', 'stand').mesh,
      bloopProp(ctx, 'patio', P[6], -5.6, 0.11, 1.25, 0, 1.3, '', 'stand').mesh,
    ];
    addSlot(ctx, 'cliente_extra', 'loja', ex[0], { extra: A.show(ex) }, 3);
  }
  // 22 caixa eletrônico "Bloop Saque"
  {
    const g = ctx.gb('vc');
    g.box(0.72, 1.7, 0.6, 0, 0, 0, '#2a6ad8');
    g.box(0.74, 0.24, 0.62, 0, 1.7, 0, TEAL);
    g.box(0.5, 0.42, 0.1, 0, 1.0, 0.3, '#1a1a20', 0, -0.25);
    g.box(0.4, 0.04, 0.2, 0, 0.82, 0.35, '#c8ccd2', 0, 0.3);
    g.box(0.2, 0.02, 0.04, 0, 0.62, 0.31, '#111');
    const m = ctx.mesh('loja', g, 'vc', -4.6, 0, 2.42);
    ctx.boxAt(-4.6, 2.42, 0.75, 0.6, 0, 2);
    const scr = ctx.picture('loja', atmScreen(), 0.4, 0.3, 0, 1.24, 0.36, 0, true, m);
    scr.rotation.x = -0.25;
    addSlot(ctx, 'caixa_eletronico', 'loja', m, {
      picture: A.tex(scr.material as THREE.MeshBasicMaterial, [0, 1, 2].map((v) => track(atmScreen(v)))),
      sound: buzz(ctx, m, 0.005, 'beep'),
      light: A.hide(scr),
    });
  }
  // 23 freezer de sorvete (tampa aberta / criatura dentro)
  {
    const g = ctx.gb('vc');
    g.box(0.7, 0.85, 1.4, 0, 0, 0, '#f2f4f8');
    g.box(0.72, 0.1, 1.42, 0, 0.0, 0, '#2a6ad8');
    g.sharp(0.6, 0.01, 1.3, 0, 0.84, 0, '#3a4a5a');
    const m = ctx.mesh('loja', g, 'vc', 3.5, 0, 9.7);
    ctx.boxAt(3.5, 9.7, 0.7, 1.4, 0, 1);
    const lid = new THREE.Group();
    lid.position.set(3.85, 0.86, 9.7);
    ctx.roomGroup('loja').add(lid);
    const lg = ctx.gb('glass');
    lg.sharp(0.68, 0.02, 1.38, -0.35, 0, 0, '#cfe8ff');
    ctx.mesh('loja', lg, 'glass', 0, 0, 0, 0, lid).renderOrder = 5;
    const cr = sombrito(ctx, 'loja', 3.5, 0.32, 9.7, -Math.PI / 2, 0.62);
    addSlot(ctx, 'freezer', 'loja', m, {
      door: A.rot(lid, [[0, 0, 1.2]]),
      creature: A.all(A.show([cr]), A.rot(lid, [[0, 0, 0.5]])),
    }, 2);
  }
  // 24 cartaz do café
  {
    const p = ctx.refs.get('poster') as THREE.Mesh;
    addSlot(ctx, 'cartaz', 'loja', p, {
      picture: A.tex(p.material as THREE.MeshLambertMaterial, [0, 1, 2].map((v) => track(storePoster(v)))),
      missing: A.hide(p),
    });
  }
  // 25 relógio
  {
    const g = new THREE.Group();
    g.position.set(3.88, 2.62, 3.6);
    g.rotation.y = -Math.PI / 2;
    ctx.roomGroup('loja').add(g);
    const fr = ctx.gb('vc');
    fr.cyl(0.3, 0.3, 0.05, 0, 0, 0, TEAL, 24, Math.PI / 2);
    ctx.mesh('loja', fr, 'vc', 0, 0, 0, 0, g);
    const face = ctx.picture('loja', clockFace(), 0.54, 0.54, 0, 0, 0.055, 0, false, g);
    addSlot(ctx, 'relogio', 'loja', g, {
      picture: A.tex(face.material as THREE.MeshLambertMaterial, [0, 1, 2].map((v) => track(clockFace(v)))),
      sound: buzz(ctx, g, 0.006, 'tick'),
      rotate: A.rot(g, [[0, 0, Math.PI]]),
    });
  }
  // 26 luz da loja
  {
    const o = new THREE.Object3D();
    o.position.set(-3, 3.3, 9);
    ctx.root.add(o);
    addSlot(ctx, 'luz_loja', 'loja', o, { light: roomLightFn(ctx, 'loja') }, 4);
  }
  // 27 máquina de salsicha (rolos)
  {
    const g = ctx.gb('vc');
    g.box(0.5, 0.1, 0.4, 0, 0, 0, '#c8ccd2');
    for (let i = 0; i < 6; i++) g.cyl(0.012, 0.012, 0.4, 0, 0.12, -0.15 + i * 0.06, '#8a8e98', 6, 0, Math.PI / 2);
    const m = ctx.mesh('loja', g, 'vc', 1.0, 1.025, 7.0);
    const sz = (b: GeoBuilder, c: string) => {
      for (let i = 0; i < 5; i++) b.cyl(0.022, 0.022, 0.3, 0, 0.15, -0.12 + i * 0.06, c, 8, 0, Math.PI / 2);
    };
    const sg = ctx.gb('vc');
    sg.ao = false;
    sz(sg, '#c8483a');
    const sm = ctx.mesh('loja', sg, 'vc', 0, 0, 0, 0, m);
    const vars = colorVariants(ctx, 'loja', sm, 'vc', ['#3a6ad8', '#3ad06a'], sz);
    addSlot(ctx, 'salsichas', 'loja', m, {
      color: A.geo(sm, vars),
      sound: buzz(ctx, sm, 0.005, 'sizzle'),
      move: motion.float(ctx, sm, 0.3),
    });
  }

  // ================================================================ ESCRITÓRIO
  // 28 monitores
  {
    const g = new THREE.Group();
    g.position.set(6.8, 0.78, 6.72);
    g.rotation.y = Math.PI;
    ctx.roomGroup('escritorio').add(g);
    const fr = ctx.gb('vc');
    fr.box(0.3, 0.02, 0.2, 0, 0, 0, '#2a2a30');
    fr.cyl(0.02, 0.02, 0.28, 0, 0, 0, '#2a2a30', 6);
    fr.box(1.3, 0.72, 0.06, 0, 0.28, -0.04, '#1a1a20');
    ctx.mesh('escritorio', fr, 'vc', 0, 0, 0, 0, g);
    const scr = ctx.picture('escritorio', postoCams(), 1.22, 0.64, 0, 0.64, 0.0, 0, true, g);
    const sm = scr.material as THREE.MeshBasicMaterial;
    let flick = false;
    ctx.onUpdate((_dt, t) => {
      if (flick) sm.color.setScalar(Math.sin(t * 25) > 0.6 ? 0.1 : 1);
    });
    addSlot(ctx, 'monitores', 'escritorio', g, {
      picture: A.tex(sm, [0, 1, 2].map((v) => track(postoCams(v)))),
      light: (on) => {
        flick = on;
        if (!on) sm.color.setScalar(1);
      },
    });
  }
  // 29 cadeira
  {
    const g = ctx.gb('vc');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.box(0.04, 0.03, 0.3, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, '#2a2a30', -a + Math.PI / 2);
    }
    g.cyl(0.03, 0.03, 0.4, 0, 0.05, 0, '#8a8e98', 8);
    g.box(0.5, 0.08, 0.48, 0, 0.45, 0, TEAL_D);
    g.box(0.46, 0.6, 0.07, 0, 0.55, -0.24, TEAL_D, 0, -0.08);
    const m = ctx.mesh('escritorio', g, 'vc', 6.8, 0, 5.7, Math.PI);
    addSlot(ctx, 'cadeira', 'escritorio', m, {
      rotate: A.pick(motion.spin(ctx, m, 2.5), A.rot(m, [[0, Math.PI, 0]])),
      move: A.move(m, [
        [-2.0, 0, -2.6, 0.8],
        [2.2, 0, -2.2, 2.0],
      ]),
    });
  }
  // 30 cofre
  {
    const g = ctx.gb('vc');
    g.box(0.6, 0.7, 0.55, 0, 0, 0, '#3a3e48');
    ctx.mesh('escritorio', g, 'vc', 9.5, 0, 6.5);
    ctx.boxAt(9.5, 6.5, 0.6, 0.55, 0, 0.8);
    const piv = new THREE.Group();
    piv.position.set(9.2, 0.05, 6.21);
    piv.rotation.y = Math.PI;
    ctx.roomGroup('escritorio').add(piv);
    const d = ctx.gb('vc');
    d.box(0.56, 0.6, 0.05, -0.28, 0, 0, '#4a4e58');
    d.cyl(0.06, 0.06, 0.04, -0.3, 0.32, -0.03, '#c8ccd2', 14, Math.PI / 2);
    ctx.mesh('escritorio', d, 'vc', 0, 0, 0, 0, piv);
    addSlot(ctx, 'cofre', 'escritorio', piv, { door: A.rot(piv, [[0, -1.6, 0], [0, -0.6, 0]]) });
  }

  // ================================================================ DEPÓSITO
  // 31 caixas (torre / no meio da porta / some uma pilha)
  {
    const g = ctx.gb('vc');
    for (let i = 0; i < 3; i++) g.box(0.5, 0.36, 0.5, (i % 2) * 0.03, i * 0.36, 0, ['#c89a6a', '#b8885a', '#d8aa7a'][i], i * 0.2);
    const m = ctx.mesh('deposito', g, 'vc', 6.0, 0, 11.0);
    ctx.boxAt(6.0, 11.0, 0.6, 0.6, 0, 1.2);
    const t = ctx.gb('vc');
    for (let i = 0; i < 8; i++) t.box(0.5, 0.36, 0.5, (i % 3) * 0.04 - 0.04, i * 0.36, 0, ['#c89a6a', '#b8885a', '#d8aa7a'][i % 3], i * 0.25);
    const tower = ctx.mesh('deposito', t, 'vc', 7.3, 0, 9.0);
    addSlot(ctx, 'caixas', 'deposito', m, {
      extra: A.show([tower]),
      move: A.move(m, [
        [-1.6, 0, 2.5, 0.3],
        [1.5, 0, -2.6, 0],
      ]),
      missing: A.hide(m),
    });
  }
  // 32 porta dos fundos
  {
    const piv = new THREE.Group();
    piv.position.set(9.95, 0, 12.0);
    ctx.roomGroup('deposito').add(piv);
    const d = ctx.gb('vc');
    d.box(0.05, 2.18, 1.0, 0, 0, 0.5, '#7a8088');
    d.box(0.08, 0.06, 0.8, -0.06, 1.0, 0.5, '#c8ccd2');
    ctx.mesh('deposito', d, 'vc', 0, 0, 0, 0, piv);
    ctx.g('deposito', 'glow').box(0.02, 0.18, 0.5, 9.88, 2.4, 12.5, '#3aff7a');
    addSlot(ctx, 'porta_fundos', 'deposito', piv, {
      door: A.rot(piv, [
        [0, -1.4, 0],
        [0, -0.45, 0],
      ]),
      sound: buzz(ctx, piv, 0.006, 'knock'),
    });
  }
  // 33 criatura no depósito
  {
    const cr = creatures(ctx, 'deposito', [
      [9.3, 2.42, 9.0, -Math.PI / 2, 0.7],
      [8.6, 0, 14.8, -2.4, 1.0],
    ]);
    addSlot(ctx, 'criatura_deposito', 'deposito', cr[0], { creature: A.show(cr) }, 2);
  }
  // 34 luz do depósito
  {
    const o = new THREE.Object3D();
    o.position.set(7, 3.3, 11.5);
    ctx.root.add(o);
    addSlot(ctx, 'luz_deposito', 'deposito', o, { light: roomLightFn(ctx, 'deposito') }, 4);
  }

  // ================================================================ BANHEIRO (fora)
  // 35 espelho
  {
    const fr = ctx.g('banheiro', 'vc');
    fr.box(0.04, 0.8, 0.7, 15.95, 1.15, 5.1, '#c8ccd2');
    const m = ctx.picture('banheiro', mirrorTexP(), 0.62, 0.72, 15.92, 1.55, 5.1, -Math.PI / 2, true);
    (m.material as THREE.Material).userData.baseCol = new THREE.Color(0.75, 0.75, 0.75);
    (m.material as THREE.MeshBasicMaterial).color.setScalar(0.75);
    addSlot(ctx, 'espelho', 'banheiro', m, {
      picture: A.tex(m.material as THREE.MeshBasicMaterial, [0, 2].map((v) => track(mirrorTexP(v)))),
      creature: A.tex(m.material as THREE.MeshBasicMaterial, [track(mirrorTexP(1))]),
    });
  }
  // 36 porta do banheiro
  {
    const d = ctx.refs.get('doorWC')!;
    addSlot(ctx, 'porta_banheiro', 'banheiro', d, {
      door: A.rot(d, [
        [0, -1.25, 0],
        [0, 0.4, 0],
      ]),
      sound: buzz(ctx, d, 0.008, 'knock'),
    });
  }
  // 37 luz do banheiro
  {
    const o = new THREE.Object3D();
    o.position.set(14, 2.9, 6.5);
    ctx.root.add(o);
    addSlot(ctx, 'luz_banheiro', 'banheiro', o, { light: roomLightFn(ctx, 'banheiro') }, 4);
  }
  // 38 torneira pingando/aberta
  {
    const st = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 6)), new THREE.MeshBasicMaterial({ color: '#bfe4ff', transparent: true, opacity: 0.7 }));
    ctx.adopt('banheiro', st.material as THREE.Material, true);
    st.position.set(15.82, 0.96, 5.1);
    st.visible = false;
    ctx.roomGroup('banheiro').add(st);
    const run = anim(ctx, st, (o, t) => (o.scale.x = o.scale.z = 1 + Math.sin(t * 50) * 0.2));
    st.userData.soundHint = 'water';
    addSlot(ctx, 'torneira', 'banheiro', st, {
      sound: (on, v) => {
        run(on, v);
        st.visible = on;
      },
    }, 1);
  }

  // ================================================================ LAVA-JATO
  // 39 escovas (giram sozinhas / cor / no meio)
  {
    const mk = (b: GeoBuilder, c: string) => {
      b.cyl(0.05, 0.05, 3.0, 0, 0.2, 0, '#c8ccd2', 8);
      for (let i = 0; i < 9; i++) b.cyl(0.55, 0.55, 0.22, 0, 0.35 + i * 0.3, 0, i % 2 ? c : '#f2f2f2', 14);
    };
    const brushes: THREE.Mesh[] = [];
    for (const x of [-21.6, -16.4]) {
      const b = ctx.gb('vc');
      mk(b, '#2a6ad8');
      brushes.push(ctx.mesh('lavajato', b, 'vc', x, 0, -1.0));
      ctx.boxAt(x, -1.0, 1.2, 1.2, 0, 3);
    }
    const pink = colorVariants(ctx, 'lavajato', brushes[0], 'vc', ['#ff4a9a', '#1a1a20'], mk);
    addSlot(ctx, 'escovas', 'lavajato', brushes[0], {
      sound: A.all(motion.spin(ctx, brushes[0], 5), motion.spin(ctx, brushes[1], -5)),
      color: A.geo(brushes[0], pink),
      move: A.move(brushes[1], [[-2.6, 0, 0, 0]]),
    });
  }
  // 40 criatura no lava-jato
  {
    const cr = creatures(ctx, 'lavajato', [
      [-19, 0, -4.2, Math.PI, 1.3],
      [-21.0, 0, -1.6, Math.PI - 0.6, 0.9],
      [-19, 4.32, -10.3, Math.PI, 1.0],
    ]);
    addSlot(ctx, 'criatura_lavajato', 'lavajato', cr[0], { creature: A.show(cr) }, 3);
  }
  // 41 luz do lava-jato
  {
    const o = new THREE.Object3D();
    o.position.set(-19, 4.0, -3);
    ctx.root.add(o);
    addSlot(ctx, 'luz_lavajato', 'lavajato', o, { light: roomLightFn(ctx, 'lavajato') }, 4);
  }
  // 42 postes da estrada
  {
    const o = new THREE.Object3D();
    o.position.set(14, 6.5, -24);
    ctx.root.add(o);
    addSlot(ctx, 'luz_estrada', 'estrada', o, { light: roomLightFn(ctx, 'estrada') }, 4);
  }
  // 44 extintor da ilha trocado (pato de borracha gigante / bisnaga de ketchup gigante)
  {
    const g = ctx.gb('vc');
    g.cyl(0.1, 0.1, 0.5, 0, 0, 0, '#e8302a', 12);
    g.sph(0.1, 0, 0.5, 0, '#e8302a', 1, 0.5, 1, 10);
    g.box(0.06, 0.1, 0.06, 0, 0.55, 0, '#2a2a30');
    g.tube(
      [
        [0.03, 0.6, 0],
        [0.15, 0.5, 0.05],
        [0.12, 0.2, 0.1],
      ],
      0.015,
      '#2a2a30',
      8,
      5,
    );
    const ext = ctx.mesh('patio', g, 'vc', 3.5, 0.26, -14.4);
    const duck = ctx.gb('vc');
    duck.sph(0.2, 0, 0.18, 0, '#ffd23a', 1.2, 0.9, 1, 12);
    duck.sph(0.13, 0.12, 0.42, 0, '#ffd23a', 1, 1, 1, 10);
    duck.box(0.12, 0.04, 0.09, 0.27, 0.4, 0, '#ff8a1a');
    duck.sph(0.02, 0.2, 0.47, 0.07, '#111', 1, 1, 1, 5);
    duck.sph(0.02, 0.2, 0.47, -0.07, '#111', 1, 1, 1, 5);
    const dm = ctx.mesh('patio', duck, 'vc', 3.5, 0.26, -14.4, -Math.PI / 2);
    const kb = ctx.gb('vc');
    kb.cyl(0.12, 0.14, 0.62, 0, 0, 0, '#e8302a', 12);
    kb.cyl(0.03, 0.08, 0.14, 0, 0.62, 0, '#f2f2f2', 10);
    const km = ctx.mesh('patio', kb, 'vc', 3.5, 0.26, -14.4);
    addSlot(ctx, 'extintor', 'patio', ext, { swap: A.swap(ext, [dm, km]), missing: A.hide(ext), scale: A.scale(ext, [2.2]) }, 2);
  }
  // 43 motorista da bomba 1 (rosto errado / sumiu)
  {
    const drv = ctx.refs.get('pumpDriver0') as THREE.Mesh;
    addSlot(ctx, 'motorista', 'patio', drv, { face: A.geo(drv, drv.userData.faces as THREE.BufferGeometry[]), missing: A.hide(drv) }, 4);
  }
}
