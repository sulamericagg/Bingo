/* ============================================================
 *  LANCHONETE — pontos de anomalia (35+). Cada um liga/desliga uma
 *  variação barata: visibilidade, transformação, troca de geometria
 *  (já assada no lugar), textura de quadro/tela, luz da sala, animação.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GeoBuilder } from '../../../../3d/common/geo';
import { A, addSlot, anim, buzz, type MapCtx } from '../kit2/ctx';
import { BLOOP_PALS } from '../kit2/chars';
import { bloopProp, car, sombrito } from '../kit2/props';
import { bloopSlot, colorVariants, creatures, motion, roomLightFn } from '../kit2/slots';
import { bottle3, burger3, burgo3, cup3, fries3, tray3 } from '../kit2/food';
import { BOOTHS, TABLES, chair } from './furniture';
import { camScreens, clockFace, employeePhoto, kidsMural, menuBoards, mirrorTex, poster, registerScreen, logoSign, driveMenu } from './art';

export function buildAnomalies(ctx: MapCtx): void {
  const P = BLOOP_PALS;
  const track = <T extends THREE.Texture>(t: T) => ctx.track(t);

  // ================================================================ SALÃO
  // 1-3 clientes
  bloopSlot(ctx, 'cliente_cabine', 'salao', P[0], [BOOTHS[0] - 0.68, 0.47, 8.2, Math.PI / 2], {
    pose: 'sit',
    scale: 1.15,
    hat: 'cap',
    kinds: ['face', 'missing', 'rotate', 'color', 'scale'],
  });
  bloopSlot(ctx, 'cliente_cabine2', 'salao', P[1], [BOOTHS[2] + 0.68, 0.47, 8.2, -Math.PI / 2], {
    pose: 'sit',
    scale: 1.1,
    hat: 'bow',
    kinds: ['face', 'missing', 'move', 'scale'],
    move: [
      [-1.36, 0, 0, Math.PI],
      [-0.68, 0.3, 0.15, 0],
    ],
  });
  bloopSlot(ctx, 'cliente_mesa', 'salao', P[2], [TABLES[3][0] - 0.55, 0.47, TABLES[3][1], Math.PI / 2], {
    pose: 'sit',
    scale: 1.1,
    kinds: ['face', 'rotate', 'color'],
  });
  // 4 cliente que não estava lá (3 lugares) + criatura numa mesa
  {
    const extras = [
      bloopProp(ctx, 'salao', P[3], TABLES[0][0] + 0.55, 0.47, TABLES[0][1], -Math.PI / 2, 1.1, 'beanie', 'sit').mesh,
      bloopProp(ctx, 'salao', P[5], -3.0, 0, 8.55, 0, 1.3, '', 'stand').mesh,
      bloopProp(ctx, 'kids', P[6], -11.6, 0, 3.6, -Math.PI / 2, 1.25, '', 'stand').mesh,
    ];
    const cr = creatures(ctx, 'salao', [
      [TABLES[1][0] + 0.55, 0.47, TABLES[1][1], -Math.PI / 2, 1.0],
      [-0.4, 0, -1.6, 0, 1.2],
    ]);
    addSlot(ctx, 'cliente_novo', 'salao', extras[0], { extra: A.show(extras), creature: A.show(cr) }, 3);
  }
  // 5 bisnagas de ketchup/mostarda
  {
    const [x, z] = TABLES[1];
    const pals: [string, string][] = [
      ['#e8302a', '#ffcc1a'],
      ['#ffcc1a', '#e8302a'],
      ['#3ad06a', '#3ad06a'],
      ['#9a4aff', '#2a2a30'],
    ];
    const mk = (g: GeoBuilder, p: [string, string]) => {
      bottle3(g, -0.07, 0, 0, p[0], 0.95);
      bottle3(g, 0.07, 0, 0, p[1], 0.95);
      g.box(0.1, 0.12, 0.06, 0, 0, 0.32, '#c8ccd2');
      g.box(0.08, 0.1, 0.03, 0, 0.02, 0.32, '#ffffff');
    };
    const g = ctx.gb('vc');
    g.ao = false;
    mk(g, pals[0]);
    const m = ctx.mesh('salao', g, 'vc', x, 0.745, z - 0.12);
    const vars = colorVariants(ctx, 'salao', m, 'vc', pals.slice(1), mk);
    addSlot(ctx, 'ketchup', 'salao', m, {
      color: A.geo(m, vars),
      move: A.move(m, [
        [0, 0.55, 0, 0.6],
        [0.6, -0.745, 0.4, 1.2],
        [0, 0, -0.2, Math.PI / 2],
      ]),
      missing: A.hide(m),
    });
  }
  // 6 batatas e lanche na bandeja (flutuam!)
  {
    const [x, z] = TABLES[2];
    const tg = ctx.gb('vc');
    tray3(tg, 0, 0, 0, '#c8302a');
    burger3(tg, -0.1, 0.022, 0, 1.1);
    cup3(tg, 0.13, 0.022, -0.06, 1);
    const tray = ctx.mesh('salao', tg, 'vc', x, 0.745, z, 0.2);
    const fg = ctx.gb('vc');
    fg.ao = false;
    fries3(fg, 0, 0, 0, 1.25);
    const fr = ctx.mesh('salao', fg, 'vc', 0.06, 0.022, 0.08, 0, tray);
    addSlot(ctx, 'batatas', 'salao', fr, {
      move: motion.float(ctx, fr, 0.35),
      scale: A.scale(fr, [2.6, 0.45]),
      missing: A.hide(tray),
      extra: (() => {
        const eg = ctx.gb('vc');
        eg.ao = false;
        for (let i = 0; i < 5; i++) fries3(eg, -0.16 + (i % 3) * 0.16, 0, Math.floor(i / 3) * 0.14 - 0.07, 1.2, '#e8423a', i);
        const em = ctx.mesh('salao', eg, 'vc', x, 0.745, z + 0.05);
        return A.show([em]);
      })(),
    });
  }
  // 7 cadeira da mesa 1 (virada / de pernas pro ar / caída)
  {
    const [x, z] = TABLES[0];
    const g = ctx.gb('vc');
    chair(g, 0, 0, 0);
    const m = ctx.mesh('salao', g, 'vc', x - 0.55, 0, z, Math.PI / 2);
    addSlot(ctx, 'cadeira', 'salao', m, {
      rotate: A.rot(m, [
        [0, Math.PI, 0],
        [Math.PI, 0, 0, 1.68],
        [0, 0, Math.PI / 2, 0.24],
      ]),
      move: A.move(m, [
        [0, 0, 1.4, 0.4],
        [1.5, 0, -0.8, 2],
      ]),
    });
  }
  // 8 cadeira a mais
  {
    const list: THREE.Object3D[] = [];
    for (const [x, z, ry, y, rx] of [
      [TABLES[1][0], TABLES[1][1] - 0.55, 0, 0, 0],
      [TABLES[3][0], TABLES[3][1], 0.3, 0.765, Math.PI],
      [-1.0, 5.2, Math.PI, 0, 0],
    ]) {
      const g = ctx.gb('vc');
      chair(g, 0, 0, 0);
      const m = ctx.mesh('salao', g, 'vc', x, y + (rx ? 0.94 : 0), z, ry);
      m.rotation.x = rx;
      list.push(m);
    }
    addSlot(ctx, 'cadeira_extra', 'salao', list[0], { extra: A.show(list) }, 3);
  }
  // 9 mascote Burgo
  {
    const g = ctx.gb('vc');
    burgo3(g, 'smile');
    const m = ctx.mesh('salao', g, 'vc', -2.75, 0, 7.35, Math.PI * 0.85);
    const fg = ctx.gb('vc');
    burgo3(fg, 'fangs');
    const fang = ctx.bakeAs('salao', m, fg.build());
    ctx.boxAt(-2.75, 7.35, 0.9, 0.9, 0, 1.5);
    addSlot(ctx, 'mascote', 'salao', m, {
      rotate: A.rot(m, [
        [0, Math.PI, 0],
        [0, Math.PI / 2, 0],
        [0, -0.7, 0.25, 0],
      ]),
      face: A.geo(m, [fang]),
      move: A.move(m, [
        [1.6, 0, -2.2, -0.3],
        [5.5, 0, -1.5, 0.6],
      ]),
      scale: A.scale(m, [1.55, 0.6]),
    });
  }
  // 10-11 cartazes
  {
    const p1 = ctx.picture('salao', poster('promo'), 0.75, 1.03, 1.8, 1.75, -1.885, 0);
    addSlot(ctx, 'cartaz_combo', 'salao', p1, {
      picture: A.tex(p1.material as THREE.MeshLambertMaterial, [0, 1].map((v) => track(poster('promo', v)))),
      missing: A.hide(p1),
      rotate: A.rot(p1, [[0, 0, Math.PI]]),
    });
    const p2 = ctx.picture('salao', poster('combo'), 0.75, 1.03, -4.4, 1.75, -1.885, 0);
    addSlot(ctx, 'cartaz_shake', 'salao', p2, {
      picture: A.tex(p2.material as THREE.MeshLambertMaterial, [0, 2].map((v) => track(poster('combo', v)))),
      move: A.move(p2, [
        [0.0, -0.55, 0, 0],
        [-0.8, 0.3, 0, 0],
      ]),
    });
  }
  // 12 relógio (3:33, sem ponteiros, números trocados; tique-taque alto)
  {
    const fr = ctx.gb('vc');
    fr.cyl(0.33, 0.33, 0.05, 0, 0, 0, '#e8423a', 24, Math.PI / 2);
    const g = new THREE.Group();
    g.position.set(0.4, 2.45, -1.9);
    ctx.root.add(g);
    ctx.mesh('salao', fr, 'vc', 0, 0, 0, 0, g);
    const face = ctx.picture('salao', clockFace(), 0.6, 0.6, 0, 0, 0.055, 0, false, g);
    addSlot(ctx, 'relogio', 'salao', g, {
      picture: A.tex(face.material as THREE.MeshLambertMaterial, [0, 1, 2].map((v) => track(clockFace(v)))),
      sound: buzz(ctx, g, 0.006, 'tick'),
      rotate: A.rot(g, [[0, 0, Math.PI]]),
    });
  }
  // 13 luz do salão
  {
    const o = new THREE.Object3D();
    o.position.set(-1.3, 3.15, 2.4);
    ctx.root.add(o);
    addSlot(ctx, 'luz_salao', 'salao', o, { light: roomLightFn(ctx, 'salao') }, 4);
  }
  // 14 porta de entrada
  {
    const L = ctx.refs.get('doorFrontL')!;
    const R = ctx.refs.get('doorFrontR')!;
    addSlot(ctx, 'porta_entrada', 'salao', L, {
      door: A.pick(A.rot(L, [[0, -1.3, 0]]), A.all(A.rot(L, [[0, -1.2, 0]]), A.rot(R, [[0, 1.2, 0]])), A.rot(R, [[0, 0.45, 0]])),
    });
  }
  // 15 lixeira da saída (criatura espiando, barulho, fora do lugar)
  {
    const g = ctx.gb('vc');
    g.box(0.5, 0.95, 0.5, 0, 0, 0, '#8a2e28');
    g.box(0.54, 0.08, 0.54, 0, 0.95, 0, '#2a2d34');
    g.box(0.3, 0.12, 0.04, 0, 0.82, 0.26, '#20232a');
    const bin = ctx.mesh('salao', g, 'vc', 0.9, 0, 7.0, Math.PI);
    ctx.boxAt(0.9, 7.0, 0.55, 0.55);
    const peek = sombrito(ctx, 'salao', 0.9, 0.62, 7.0, Math.PI, 0.65);
    addSlot(ctx, 'lixeira', 'salao', bin, {
      creature: A.show([peek]),
      sound: buzz(ctx, bin, 0.015, 'rattle'),
      move: A.move(bin, [
        [-1.9, 0, -2.4, 0.5],
        [-2.6, 0, 1.0, 0],
      ]),
    });
  }
  // 16 planta (cresceu / murcha / vermelha)
  {
    const mk = (g: GeoBuilder, cols: string[]) => {
      g.lathe(
        [
          [0, 0],
          [0.17, 0],
          [0.22, 0.38],
          [0.24, 0.42],
          [0, 0.42],
        ],
        0,
        0,
        0,
        '#3a3a46',
        14,
      );
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const r = 0.12 + (i % 3) * 0.05;
        g.sph(0.2 + (i % 2) * 0.05, Math.cos(a) * r, 0.95 + (i % 3) * 0.18, Math.sin(a) * r, cols[i % 3], 1, 1.2, 1, 9);
      }
    };
    const g = ctx.gb('vc');
    mk(g, ['#3f9a4a', '#58b85a', '#2f7a3a']);
    const m = ctx.mesh('salao', g, 'vc', 3.55, 0, -1.5);
    ctx.boxAt(3.55, -1.5, 0.5, 0.5);
    const vars = colorVariants(ctx, 'salao', m, 'vc', [['#8a6a3a', '#6a5030', '#a08048'], ['#d8303a', '#ff5a6a', '#a81a2a']], mk);
    addSlot(ctx, 'planta', 'salao', m, { color: A.geo(m, vars), scale: A.scale(m, [1.7, 0.5]), move: A.move(m, [[-1.2, 0, 1.0, 0]]) });
  }

  // ================================================================ CANTINHO KIDS
  // 17 pelúcia
  {
    const m = bloopProp(ctx, 'kids', { light: '#c8a07a', dark: '#8a6040', belly: '#f2e2c8' }, -9.0, 0.55, 3.4, 0.4, 0.42, 'bow', 'sit');
    addSlot(ctx, 'pelucia', 'kids', m.mesh, {
      move: A.move(m.mesh, [
        [-2.2, 0.62, -2.0, 0],
        [-1.6, -0.15, 2.8, 2],
        [1.2, -0.55, -1.6, 0],
      ]),
      rotate: A.rot(m.mesh, [
        [0, Math.PI, 0],
        [Math.PI, 0, 0, 0.42],
      ]),
      face: A.geo(m.mesh, m.faces),
      scale: A.scale(m.mesh, [2.6]),
    });
  }
  // 18 piscina de bolinhas
  {
    const balls = ctx.refs.get('balls') as THREE.InstancedMesh;
    const base = balls.instanceColor!.array.slice() as Float32Array;
    const recolor = (cols: string[]) => {
      const c = new THREE.Color();
      for (let i = 0; i < balls.count; i++) {
        c.set(cols[i % cols.length]).multiplyScalar(0.7);
        balls.setColorAt(i, c);
      }
      balls.instanceColor!.needsUpdate = true;
    };
    const cr = creatures(ctx, 'kids', [
      [-10.6, 0.05, 7.0, 0.6, 1.0],
      [-9.8, -0.2, 5.8, 0.2, 0.8],
    ]);
    addSlot(ctx, 'bolinhas', 'kids', balls, {
      color: (on, v) => {
        if (!on) {
          (balls.instanceColor!.array as Float32Array).set(base);
          balls.instanceColor!.needsUpdate = true;
          return;
        }
        recolor([['#ff2a2a'], ['#1a1a20', '#2a2a30'], ['#f2f2f2']][v % 3]);
      },
      creature: A.show(cr),
      sound: buzz(ctx, balls, 0.01, 'balls'),
    });
  }
  // 19 mural
  {
    const m = ctx.picture('kids', kidsMural(), 2.4, 1.2, -10.6, 1.9, -1.885, 0);
    addSlot(ctx, 'mural', 'kids', m, {
      picture: A.tex(m.material as THREE.MeshLambertMaterial, [0, 1, 2].map((v) => track(kidsMural(v)))),
      missing: A.hide(m),
    });
  }
  // 20 brinquedo de mola (hambúrguer)
  {
    const g = ctx.gb('vc');
    g.cyl(0.35, 0.4, 0.06, 0, 0, 0, '#3a3a46', 16);
    g.tube(
      [
        [0, 0.05, 0],
        [0.06, 0.15, 0.05],
        [-0.05, 0.25, -0.05],
        [0.06, 0.35, 0.05],
        [0, 0.45, 0],
      ],
      0.03,
      '#c8ccd4',
      16,
      6,
    );
    burger3(g, 0, 0.42, 0, 8, '#8a4a28');
    g.box(0.06, 0.25, 0.06, 0.18, 0.95, 0.2, '#ffd23a');
    g.box(0.06, 0.25, 0.06, -0.18, 0.95, 0.2, '#ffd23a');
    g.sph(0.07, 0.17, 0.82, 0.48, '#ffffff', 1, 1, 0.6, 8);
    g.sph(0.07, -0.17, 0.82, 0.48, '#ffffff', 1, 1, 0.6, 8);
    g.sph(0.035, 0.17, 0.82, 0.52, '#2a1140', 1, 1, 0.6, 6);
    g.sph(0.035, -0.17, 0.82, 0.52, '#2a1140', 1, 1, 0.6, 6);
    const m = ctx.mesh('kids', g, 'vc', -7.7, 0, 6.5, -0.5);
    ctx.boxAt(-7.7, 6.5, 0.9, 0.9);
    addSlot(ctx, 'brinquedo_mola', 'kids', m, {
      sound: motion.bounce(ctx, m, 0.1),
      rotate: A.rot(m, [[0, Math.PI, 0]]),
      move: A.move(m, [
        [-1.4, 0, -2.6, 1],
        [0.2, 0, -5.2, 0],
      ]),
    });
  }

  // ================================================================ BALCÃO
  // 21 cardápios (atlas com 3 painéis)
  {
    const g = new THREE.Group();
    g.position.set(7.0, 2.62, -1.86);
    ctx.root.add(g);
    const fr = ctx.gb('vc');
    fr.box(5.6, 1.18, 0.1, 0, -0.59, -0.02, '#2a2a30');
    for (const x of [-2.75, 2.75]) fr.cyl(0.01, 0.01, 0.5, x, 0.55, -0.02, '#555', 4);
    ctx.mesh('balcao', fr, 'vc', 0, 0, 0, 0, g);
    const tex = menuBoards();
    const parts: THREE.PlaneGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.PlaneGeometry(1.76, 1.1);
      const uv = p.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 3);
      p.translate(-1.84 + i * 1.84, 0, 0.04);
      parts.push(p);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.toneMapped = false;
    ctx.adopt('balcao', mat, true);
    ctx.track(tex);
    g.add(new THREE.Mesh(ctx.track(mergeGeometries(parts, false)!), mat));
    for (const p of parts) p.dispose();
    const vars = [0, 1, 2].map((v) => track(menuBoards(v)));
    let flick = false;
    let dark = false;
    ctx.onUpdate((_dt, t) => {
      if (flick) mat.color.setScalar(Math.sin(t * 31) * Math.sin(t * 7) > 0.3 ? 0.15 : 1);
      else if (dark) mat.color.setScalar(0.1);
    });
    addSlot(ctx, 'cardapio', 'balcao', g, {
      picture: A.tex(mat, vars),
      light: (on, v) => {
        flick = on && v % 2 === 0;
        dark = on && v % 2 === 1;
        if (!on) mat.color.setScalar(1);
      },
    });
  }
  // 22 caixa 2
  {
    const reg = ctx.refs.get('register1')!;
    const scr = ctx.refs.get('regCust1') as THREE.Mesh;
    addSlot(ctx, 'caixa2', 'balcao', reg, {
      picture: A.tex(scr.material as THREE.MeshBasicMaterial, [track(registerScreen(0))]),
      rotate: A.rot(reg, [
        [0, Math.PI, 0],
        [0, 0.7, 0],
      ]),
      move: A.move(reg, [[0.6, 0, 0.12, 0.4]]),
      sound: buzz(ctx, reg, 0.008, 'beep'),
    });
  }
  // 23 máquina de bebidas servindo sozinha
  {
    const m = ctx.refs.get('drinkMachine')!;
    const cup = ctx.refs.get('drinkCup')!;
    const st = ctx.refs.get('drinkStream')!;
    const pour = anim(ctx, st, (o, t) => {
      o.scale.y = 0.9 + Math.sin(t * 40) * 0.1;
    });
    addSlot(ctx, 'maquina_bebida', 'balcao', m, {
      sound: (on, v) => {
        pour(on, v);
        st.visible = on;
        cup.visible = on;
      },
      light: (on) => {
        const lbl = m.children[1] as THREE.Mesh;
        lbl.visible = !on;
      },
    });
  }
  // 24 cliente da fila
  bloopSlot(ctx, 'cliente_fila', 'balcao', P[4], [7.4, 0, 3.15, Math.PI], {
    scale: 1.35,
    hat: 'visor',
    kinds: ['face', 'missing', 'rotate', 'scale', 'move'],
    move: [
      [0, 1.05, -1.15, 0],
      [-2.4, 0, 2.6, 0.6],
    ],
  });
  // 25 bandeja da retirada (lanche trocado por pato de borracha / pedra / tênis)
  {
    const g = ctx.gb('vc');
    g.ao = false;
    tray3(g, 0, 0, 0, '#c8302a');
    const tray = ctx.mesh('balcao', g, 'vc', 9.0, 1.03, 2.05, 0.15);
    const food = ctx.gb('vc');
    food.ao = false;
    burger3(food, -0.08, 0.022, 0, 1.2);
    fries3(food, 0.12, 0.022, 0.03, 1.1);
    const fm = ctx.mesh('balcao', food, 'vc', 0, 0, 0, 0, tray);
    const alt = (f: (g: GeoBuilder) => void) => {
      const a = ctx.gb('vc');
      a.ao = false;
      f(a);
      const m = ctx.mesh('balcao', a, 'vc', 0, 0.022, 0, 0, tray);
      return m;
    };
    const duck = alt((a) => {
      a.sph(0.08, 0, 0.07, 0, '#ffd23a', 1.2, 0.9, 1, 12);
      a.sph(0.05, 0.06, 0.15, 0, '#ffd23a', 1, 1, 1, 10);
      a.box(0.05, 0.02, 0.04, 0.12, 0.14, 0, '#ff8a1a');
      a.sph(0.01, 0.08, 0.17, 0.035, '#111', 1, 1, 1, 5);
      a.sph(0.01, 0.08, 0.17, -0.035, '#111', 1, 1, 1, 5);
    });
    const shoe = alt((a) => {
      a.box(0.26, 0.04, 0.1, 0, 0, 0, '#f2f2f2');
      a.box(0.2, 0.08, 0.09, -0.02, 0.04, 0, '#3a6ad8');
      a.box(0.08, 0.06, 0.09, -0.08, 0.1, 0, '#3a6ad8');
    });
    const rock = alt((a) => a.geo(new THREE.DodecahedronGeometry(0.09, 0), '#7a7a80', 0, 0.07, 0));
    addSlot(ctx, 'bandeja', 'balcao', tray, {
      swap: A.swap(fm, [duck, shoe, rock]),
      move: A.move(tray, [
        [0, 0.6, 0, 0.5],
        [-0.3, -1.03, 1.0, 2],
      ]),
      scale: A.scale(fm, [2.4]),
    });
  }

  // ================================================================ COZINHA
  // 26 carnes da chapa
  {
    const grill = ctx.refs.get('grill')!;
    const patties = grill.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'CylinderGeometry') as THREE.Mesh[];
    const blue = ctx.adopt('cozinha', new THREE.MeshLambertMaterial({ color: '#3a6ad8' }), false, new THREE.Color('#3a6ad8'));
    const green = ctx.adopt('cozinha', new THREE.MeshLambertMaterial({ color: '#3ac85a' }), false, new THREE.Color('#3ac85a'));
    const prev = patties.map((p) => p.material);
    const tg = ctx.gb('vc');
    tg.ao = false;
    for (let i = 0; i < 9; i++) tg.cyl(0.075, 0.075, 0.022, (i % 2) * 0.01, i * 0.024, 0, '#7a4228', 14);
    const tower = ctx.mesh('cozinha', tg, 'vc', 0, 0.13, 0.05, 0, grill);
    tower.visible = false;
    addSlot(ctx, 'chapa_carnes', 'cozinha', grill, {
      color: (on, v) => patties.forEach((p, i) => (p.material = on ? [blue, green][v % 2] : prev[i])),
      extra: A.show([tower]),
      missing: (on) => patties.forEach((p) => (p.visible = !on)),
    });
  }
  // 27 fritadeira
  {
    const fr = ctx.refs.get('fryer')!;
    const bk = ctx.refs.get('fryBasketL')!;
    const cr = creatures(ctx, 'cozinha', [[5.0, 0.92, -8.75, 0, 0.55]]);
    addSlot(ctx, 'fritadeira', 'cozinha', fr, {
      sound: buzz(ctx, fr, 0.004, 'bubbles'),
      move: anim(ctx, bk, (o, t) => (o.position.y = 1.6 + Math.sin(t * 2) * 0.1)),
      creature: A.show(cr),
    });
  }
  // 28 batatas da estufa (flutuando!)
  {
    const g = ctx.gb('steel');
    g.box(1.1, 0.06, 0.6, 0, 0, 0, '#c8ccd2');
    g.box(1.1, 0.12, 0.03, 0, 0.06, -0.3, '#c8ccd2');
    ctx.mesh('cozinha', g, 'steel', 6.3, 0.86, -8.55);
    ctx.g('cozinha', 'glow').box(0.9, 0.02, 0.15, 6.3, 1.7, -8.6, '#ff9a4a');
    const fg = ctx.gb('vc');
    fg.ao = false;
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4;
      const r = (i % 7) * 0.05;
      fg.sharp(0.016, 0.1, 0.016, Math.cos(a) * r * 1.4, 0.0 + (i % 5) * 0.02, Math.sin(a) * r * 0.6, i % 2 ? '#ffd45a' : '#ffc93a', a, 1.2 + (i % 3) * 0.2);
    }
    const pile = ctx.mesh('cozinha', fg, 'vc', 6.3, 0.94, -8.52);
    const blue = colorVariants(ctx, 'cozinha', pile, 'vc', ['#4a8aff', '#ff4a8a'], (gg, c) => {
      for (let i = 0; i < 40; i++) {
        const a = i * 2.4;
        const r = (i % 7) * 0.05;
        gg.sharp(0.016, 0.1, 0.016, Math.cos(a) * r * 1.4, 0.0 + (i % 5) * 0.02, Math.sin(a) * r * 0.6, c, a, 1.2 + (i % 3) * 0.2);
      }
    });
    addSlot(ctx, 'batatas_estufa', 'cozinha', pile, {
      move: motion.float(ctx, pile, 0.5),
      color: A.geo(pile, blue),
      scale: A.scale(pile, [2.2]),
    });
  }
  // 29 utensílios pendurados (um balança sozinho)
  {
    const g = new THREE.Group();
    g.position.set(7.5, 1.95, -8.92);
    ctx.root.add(g);
    const bar = ctx.gb('vc');
    bar.cyl(0.015, 0.015, 1.0, 0, 0, 0, '#c8ccd2', 8, 0, Math.PI / 2);
    bar.cyl(0.015, 0.015, 1.0, -0.5, 0, 0, '#c8ccd2', 8, 0, Math.PI / 2);
    ctx.mesh('cozinha', bar, 'vc', 0.5, 0, 0, 0, g);
    const tools: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const t = ctx.gb('vc');
      t.cyl(0.012, 0.012, 0.35, 0, -0.37, 0, '#2a2a30', 6);
      if (i % 2) t.box(0.12, 0.003, 0.12, 0, -0.5, 0, '#c8ccd2', 0, Math.PI / 2);
      else t.sph(0.06, 0, -0.42, 0, '#c8ccd2', 1, 0.5, 1, 10);
      tools.push(ctx.mesh('cozinha', t, 'vc', -0.36 + i * 0.24, 0, 0.03, 0, g));
    }
    addSlot(ctx, 'utensilios', 'cozinha', g, {
      move: motion.swing(ctx, tools[1], 0.5, 'z'),
      missing: A.hide(tools[2]),
      rotate: A.rot(tools[0], [[0, 0, Math.PI, -0.87]]),
    });
  }
  // 30 porta da câmara fria
  {
    const d = ctx.refs.get('doorFreezer')!;
    addSlot(ctx, 'porta_camara', 'cozinha', d, {
      door: A.rot(d, [
        [0, 1.5, 0],
        [0, 0.45, 0],
      ]),
      light: roomLightFn(ctx, 'camara'),
      sound: buzz(ctx, d, 0.004, 'knock'),
    });
  }
  // 31 dentro da câmara
  {
    const cr = creatures(ctx, 'camara', [
      [11.65, 1.38, -10.6, -Math.PI / 2, 0.75],
      [10.0, 0, -11.2, 0, 1.0],
    ]);
    const bg = ctx.gb('vc');
    for (let i = 0; i < 5; i++) bg.box(0.5, 0.36, 0.5, (i % 2) * 0.04, i * 0.36, 0, ['#e8eef4', '#c8d8e8', '#b8a080'][i % 3], i * 0.3);
    const tower = ctx.mesh('camara', bg, 'vc', 10.0, 0, -10.8);
    addSlot(ctx, 'camara_dentro', 'camara', cr[1], { creature: A.show(cr), extra: A.show([tower]) }, 2);
  }
  // 32 luz da cozinha
  {
    const o = new THREE.Object3D();
    o.position.set(5.6, 3.05, -5.6);
    ctx.root.add(o);
    addSlot(ctx, 'luz_cozinha', 'cozinha', o, { light: roomLightFn(ctx, 'cozinha') }, 4);
  }
  // 33 balde de esfregão
  {
    const mk = (g: GeoBuilder) => {
      g.cyl(0.2, 0.17, 0.3, 0, 0.05, 0, '#ffd23a', 14);
      g.box(0.45, 0.05, 0.3, 0, 0, 0, '#e8b02a');
      g.cyl(0.015, 0.015, 1.3, 0.05, 0.3, 0, '#8a6a4a', 6, 0, -0.15);
      g.cyl(0.1, 0.12, 0.12, 0.0, 0.25, 0, '#e8e8e0', 10);
    };
    const g = ctx.gb('vc');
    mk(g);
    const m = ctx.mesh('cozinha', g, 'vc', 11.2, 0, -3.2);
    ctx.boxAt(11.2, -3.2, 0.5, 0.4);
    const g2 = ctx.gb('vc');
    mk(g2);
    const m2 = ctx.mesh('cozinha', g2, 'vc', 9.0, 0, -6.6, 0.7);
    addSlot(ctx, 'balde', 'cozinha', m, {
      move: A.move(m, [
        [-5.0, 0, -0.6, 0.6],
        [-2.2, 0, -3.3, 1.5],
      ]),
      extra: A.show([m2]),
      sound: buzz(ctx, m, 0.01, 'drip'),
    });
  }

  // ================================================================ BANHEIROS
  // 34 porta da cabine + pezinhos embaixo
  {
    const stall = new THREE.Group();
    stall.position.set(-10.36, 0.15, -8.95);
    ctx.root.add(stall);
    const d = ctx.gb('vc');
    d.box(0.04, 1.85, 0.72, 0, 0, 0.36, '#6aa8c8');
    d.box(0.03, 0.06, 0.1, 0.03, 0.95, 0.62, '#c8ccd2');
    ctx.mesh('banheiros', d, 'vc', 0, 0, 0, 0, stall);
    stall.rotation.y = -0.9;
    // frente fixa das cabines (painéis ao lado das portas)
    const R = ctx.g('banheiros', 'vc');
    R.box(0.05, 1.9, 0.82, -10.36, 0.12, -7.82, '#7ab8d8');
    R.box(0.05, 1.9, 0.82, -10.36, 0.12, -6.22, '#7ab8d8');
    const d2 = new THREE.Group();
    d2.position.set(-10.36, 0.15, -7.35);
    ctx.root.add(d2);
    const dd = ctx.gb('vc');
    dd.box(0.04, 1.85, 0.72, 0, 0, 0.36, '#6aa8c8');
    ctx.mesh('banheiros', dd, 'vc', 0, 0, 0, 0, d2);
    d2.rotation.y = -1.0;
    const feet = new THREE.Group();
    feet.position.set(-11.0, 0, -8.25);
    ctx.root.add(feet);
    const fg = ctx.gb('vc');
    fg.ao = false;
    for (const s of [-1, 1]) fg.sph(0.11, 0, 0.07, s * 0.16, '#1c1030', 1.5, 0.7, 1.1, 8);
    ctx.mesh('banheiros', fg, 'vc', 0, 0, 0, 0, feet);
    const shut = A.rot(stall, [[0, 0.9, 0]]);
    feet.visible = false;
    addSlot(ctx, 'porta_box', 'banheiros', stall, {
      door: A.pick(shut, A.rot(d2, [[0, 1.0, 0]])),
      creature: (on) => {
        shut(on, 0);
        feet.visible = on;
      },
      sound: buzz(ctx, stall, 0.01, 'knock'),
    });
  }
  // 35 espelho
  {
    const fr = ctx.g('banheiros', 'vc');
    fr.box(0.04, 1.0, 2.3, -6.1, 1.05, -5.0, '#c8ccd2');
    const m = ctx.picture('banheiros', mirrorTex(), 2.2, 0.9, -6.07, 1.55, -5.0, -Math.PI / 2, true);
    (m.material as THREE.MeshBasicMaterial).color.setScalar(0.8);
    (m.material as THREE.Material).userData.baseCol = new THREE.Color(0.8, 0.8, 0.8);
    addSlot(ctx, 'espelho', 'banheiros', m, {
      picture: A.tex(m.material as THREE.MeshBasicMaterial, [0, 2].map((v) => track(mirrorTex(v)))),
      creature: A.tex(m.material as THREE.MeshBasicMaterial, [track(mirrorTex(1))]),
    });
  }
  // 36 torneira aberta
  {
    const st = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6)), new THREE.MeshBasicMaterial({ color: '#bfe4ff', transparent: true, opacity: 0.7 }));
    ctx.adopt('banheiros', st.material as THREE.Material, true);
    st.position.set(-6.26, 0.98, -4.3);
    st.visible = false;
    ctx.root.add(st);
    const s2 = st.clone();
    s2.position.z = -5.7;
    s2.visible = false;
    ctx.root.add(s2);
    const run = anim(ctx, st, (o, t) => (o.scale.x = o.scale.z = 1 + Math.sin(t * 50) * 0.2));
    st.userData.soundHint = 'water';
    addSlot(ctx, 'torneira', 'banheiros', st, {
      sound: (on, v) => {
        run(on, v);
        st.visible = on;
        s2.visible = on && v % 2 === 1;
      },
    });
  }
  // 37 luz do banheiro
  {
    const o = new THREE.Object3D();
    o.position.set(-9, 3.1, -5.5);
    ctx.root.add(o);
    addSlot(ctx, 'luz_banheiro', 'banheiros', o, { light: roomLightFn(ctx, 'banheiros') }, 4);
  }
  // 38 secador de mãos
  {
    const g = ctx.gb('vc');
    g.box(0.32, 0.26, 0.2, 0, 0, 0, '#f2f2f4');
    g.box(0.14, 0.04, 0.08, 0, -0.03, 0.06, '#c8ccd2');
    const m = ctx.mesh('banheiros', g, 'vc', -7.3, 1.25, -8.88);
    addSlot(ctx, 'secador', 'banheiros', m, { sound: buzz(ctx, m, 0.006, 'dryer'), missing: A.hide(m) });
  }

  // ================================================================ ESCRITÓRIO
  // 39 monitores das câmeras
  {
    const g = new THREE.Group();
    g.position.set(-4.3, 0.78, -8.72);
    ctx.root.add(g);
    const fr = ctx.gb('vc');
    for (const sx of [-0.42, 0.42]) {
      fr.cyl(0.02, 0.02, 0.3, sx, 0, 0, '#2a2a30', 6);
      fr.box(0.25, 0.02, 0.18, sx, 0, 0, '#2a2a30');
    }
    fr.box(1.74, 0.94, 0.06, 0, 0.3, -0.04, '#1a1a20');
    ctx.mesh('escritorio', fr, 'vc', 0, 0, 0, 0, g);
    const tex = camScreens();
    const scr = ctx.picture('escritorio', tex, 1.66, 0.86, 0, 0.77, 0.0, 0, true, g);
    let flick = false;
    const sm = scr.material as THREE.MeshBasicMaterial;
    ctx.onUpdate((_dt, t) => {
      if (flick) sm.color.setScalar(Math.sin(t * 25) > 0.6 ? 0.1 : 1);
    });
    addSlot(ctx, 'monitores', 'escritorio', g, {
      picture: A.tex(sm, [0, 1, 2].map((v) => track(camScreens(v)))),
      light: (on) => {
        flick = on;
        if (!on) sm.color.setScalar(1);
      },
    });
  }
  // 40 cadeira do escritório (gira sozinha / virada / empurrada)
  {
    const g = ctx.gb('vc');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.box(0.04, 0.03, 0.3, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, '#2a2a30', -a + Math.PI / 2);
      g.sph(0.03, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3, '#1a1a1e', 1, 1, 1, 6);
    }
    g.cyl(0.03, 0.03, 0.4, 0, 0.05, 0, '#8a8e98', 8);
    g.box(0.5, 0.08, 0.48, 0, 0.45, 0, '#2a3a5a');
    g.box(0.46, 0.6, 0.07, 0, 0.55, -0.24, '#2a3a5a', 0, -0.08);
    const m = ctx.mesh('escritorio', g, 'vc', -4.3, 0, -7.65, Math.PI);
    addSlot(ctx, 'cadeira_escritorio', 'escritorio', m, {
      rotate: A.pick(motion.spin(ctx, m, 2.5), A.rot(m, [[0, Math.PI, 0]])),
      move: A.move(m, [
        [3.2, 0, 3.6, 0.8],
        [-1.0, 0, 2.2, 2.0],
      ]),
    });
  }
  // 41 foto "destaque do mês"
  {
    const m = ctx.picture('escritorio', employeePhoto(), 0.55, 0.73, -4.6, 1.65, -2.115, Math.PI);
    addSlot(ctx, 'destaque', 'escritorio', m, {
      picture: A.tex(m.material as THREE.MeshLambertMaterial, [0, 1, 2].map((v) => track(employeePhoto(v)))),
      rotate: A.rot(m, [[0, 0, 0.35]]),
    });
  }
  // 42 armário (porta aberta)
  {
    const piv = new THREE.Group();
    piv.position.set(-5.465, 0.04, -6.05);
    ctx.root.add(piv);
    const g = ctx.gb('vc');
    g.box(0.03, 1.82, 0.46, 0, 0, -0.23, '#5a8ac8');
    for (let k = 0; k < 3; k++) g.box(0.01, 0.02, 0.3, 0.015, 1.56 + k * 0.05, -0.23, '#2a3a58');
    const dm = ctx.mesh('escritorio', g, 'vc', 0, 0, 0, 0, piv);
    void dm;
    const cr = sombrito(ctx, 'escritorio', -5.75, 0.05, -6.2, Math.PI / 2, 0.55);
    addSlot(ctx, 'armario', 'escritorio', piv, {
      door: A.rot(piv, [
        [0, -1.6, 0],
        [0, -0.5, 0],
      ]),
      creature: A.all(A.rot(piv, [[0, -1.3, 0]]), A.show([cr])),
      sound: buzz(ctx, piv, 0.006, 'knock'),
    });
  }
  // 43 cofre
  {
    const g = ctx.gb('vc');
    g.box(0.6, 0.7, 0.55, 0, 0, 0, '#3a3e48');
    const base = ctx.mesh('escritorio', g, 'vc', -0.6, 0, -8.6);
    void base;
    ctx.boxAt(-0.6, -8.6, 0.6, 0.55, 0, 0.8);
    const piv = new THREE.Group();
    piv.position.set(-0.9, 0.05, -8.31);
    ctx.root.add(piv);
    const d = ctx.gb('vc');
    d.box(0.56, 0.6, 0.05, 0.28, 0, 0, '#4a4e58');
    d.cyl(0.06, 0.06, 0.04, 0.3, 0.32, 0.03, '#c8ccd2', 14, Math.PI / 2);
    d.box(0.04, 0.12, 0.04, 0.46, 0.25, 0.04, '#c8ccd2');
    ctx.mesh('escritorio', d, 'vc', 0, 0, 0, 0, piv);
    addSlot(ctx, 'cofre', 'escritorio', piv, {
      door: A.rot(piv, [
        [0, -1.7, 0],
        [0, -0.6, 0],
      ]),
    });
  }
  // 44 telefone tocando
  {
    const g = ctx.gb('vc');
    g.ao = false;
    g.box(0.2, 0.06, 0.18, 0, 0, 0, '#e8e4dc');
    g.box(0.22, 0.05, 0.06, 0, 0.07, -0.04, '#e8e4dc');
    g.box(0.12, 0.01, 0.08, 0, 0.06, 0.04, '#3a3a40');
    const m = ctx.mesh('escritorio', g, 'vc', -3.55, 0.78, -8.7, 0.3);
    addSlot(ctx, 'telefone', 'escritorio', m, {
      sound: buzz(ctx, m, 0.01, 'phone'),
      move: A.move(m, [[0.4, -0.78, 0.9, 1.2]]),
    });
  }

  // ================================================================ DRIVE-THRU
  // 45 janela do drive (aberta / criatura do lado de fora)
  {
    const w = ctx.refs.get('driveWindow')!;
    const cr = creatures(ctx, 'estac', [
      [12.55, 0.55, -0.35, -Math.PI / 2, 1.0],
      [12.7, 0, 1.0, -Math.PI / 2 - 0.4, 1.2],
    ]);
    const pane = w.children[1];
    addSlot(ctx, 'janela_drive', 'drive', w, {
      door: A.move(pane, [
        [0, 0, 0.75],
        [0, 0, 0.35],
      ]),
      creature: A.show(cr),
    });
  }
  // 46 motorista do drive (rosto / sumiu)
  {
    const drv = ctx.refs.get('driveDriver') as THREE.Mesh;
    addSlot(ctx, 'motorista', 'drive', drv, { face: A.geo(drv, drv.userData.faces as THREE.BufferGeometry[]), missing: A.hide(drv), rotate: A.rot(drv, [[0, Math.PI, 0]]) }, 4);
  }

  // ================================================================ LADO DE FORA
  // 47 letreiro alto
  {
    const s1 = ctx.refs.get('poleSign') as THREE.Mesh;
    const s2 = ctx.refs.get('poleSignB') as THREE.Mesh;
    const m1 = s1.material as THREE.MeshBasicMaterial;
    const m2 = s2.material as THREE.MeshBasicMaterial;
    let mode = 0;
    ctx.onUpdate((_dt, t) => {
      if (mode === 1) {
        const k = Math.sin(t * 19) * Math.sin(t * 5.1) > 0.25 ? 0.12 : 1;
        m1.color.setScalar(k);
        m2.color.setScalar(k);
      }
    });
    const v = [track(logoSign(0)), track(logoSign(1))];
    addSlot(ctx, 'letreiro', 'estac', s1, {
      light: (on, vv) => {
        mode = on ? (vv % 2 === 0 ? 1 : 2) : 0;
        const k = mode === 2 ? 0.08 : 1;
        m1.color.setScalar(k);
        m2.color.setScalar(k);
      },
      picture: A.all(A.tex(m1, v), A.tex(m2, v)),
    });
  }
  // 48 carro a mais
  {
    const cars = [car(ctx, 'estac', '#2a2a30', -11 + 2.6 * 1 + 1.3, 14.5, Math.PI, 'van'), car(ctx, 'estac', '#c8302a', 13.8, 8.5, Math.PI, 'pickup'), car(ctx, 'estac', '#e8e4dc', 2.0, 13.2, -Math.PI / 2 + 0.3, 'hatch')];
    addSlot(ctx, 'carro_extra', 'estac', cars[0], { extra: A.show(cars) }, 3);
  }
  // 49 vulto lá fora
  {
    const cr = creatures(ctx, 'estac', [
      [-8.0, -0.03, 13.4, Math.PI, 1.3],
      [-1.0, 0.1, 9.85, Math.PI, 1.25],
      [-18.5, 7.8, 18.6, 0, 1.0],
    ]);
    addSlot(ctx, 'vulto', 'estac', cr[1], { creature: A.show(cr) }, 3);
  }
  // 50 cardápio do drive (lá fora)
  {
    const m = ctx.refs.get('driveMenu') as THREE.Mesh;
    addSlot(ctx, 'cardapio_drive', 'estac', m, { picture: A.tex(m.material as THREE.MeshBasicMaterial, [0, 1].map((v) => track(driveMenu(v)))) });
  }
  // 51 luzes de fora
  {
    const o = new THREE.Object3D();
    o.position.set(4.5, 6, 13.4);
    ctx.root.add(o);
    addSlot(ctx, 'luz_externa', 'estac', o, { light: roomLightFn(ctx, 'estac') }, 4);
  }
}
