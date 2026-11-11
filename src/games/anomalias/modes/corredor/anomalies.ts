/* ============================================================
 *  CORREDOR — catálogo de anomalias (uma por volta, ou nenhuma).
 *  Cada uma: id, dificuldade (1 = bem visível … 3 = sutil), tema
 *  (ou todos), ponto de foco (foto da dica quando você erra) e
 *  apply() → desfazer (volta exatamente ao normal).
 *  Total: 52 genéricas + 6 por tema × 4 = 76 variantes.
 * ============================================================ */
import * as THREE from 'three';
import { signTex } from '../../maps/nightkit/tex';
import type { AnoAudio } from '../../core/audio';
import { Bocudo, type Face } from '../../core/models';
import type { NpcBloop } from '../../core/models';
import { canvasTex } from '../common';
import { HW, pictoTex, type Hall } from './hall';
import type { ThemeId } from './themes';

export interface WalkerCfg {
  face: Face;
  mode: 'normal' | 'backwards' | 'stare' | 'fast' | 'none';
  scale: number;
  twin: boolean;
  tint: string | null;
}

export interface ACtx {
  h: Hall;
  au: AnoAudio;
  walker: WalkerCfg;
  /** função por quadro até desfazer */
  anim(f: (dt: number, t: number) => void): void;
  /** posição do jogador */
  me(): { x: number; z: number };
  /** rolagem da câmera no corredor (anomalia "torto") */
  roll: { v: number };
  /** objeto extra: some no desfazer (own = descarta geometria/material) */
  track<T extends THREE.Object3D>(o: T, own?: boolean): T;
  ownTex<T extends THREE.Texture>(t: T): T;
}
export interface Anom {
  id: string;
  diff: 1 | 2 | 3;
  theme?: ThemeId;
  focus: [number, number, number];
  apply(c: ACtx): () => void;
}

type U = () => void;
const all = (...u: U[]): U => () => u.forEach((f) => f());
function vis(o: THREE.Object3D, v: boolean): U {
  const p = o.visible;
  o.visible = v;
  return () => (o.visible = p);
}
function pos(o: THREE.Object3D, x: number, y: number, z: number): U {
  const p = o.position.clone();
  o.position.set(x, y, z);
  return () => o.position.copy(p);
}
function rot(o: THREE.Object3D, x: number, y: number, z: number): U {
  const p = o.rotation.clone();
  o.rotation.set(x, y, z);
  return () => o.rotation.copy(p);
}
function scl(o: THREE.Object3D, x: number, y = x, z = x): U {
  const p = o.scale.clone();
  o.scale.set(x, y, z);
  return () => o.scale.copy(p);
}
function col(m: THREE.Material, c: THREE.ColorRepresentation): U {
  const mm = m as THREE.MeshBasicMaterial;
  const p = mm.color.clone();
  mm.color.set(c);
  return () => mm.color.copy(p);
}
function tex(m: THREE.Material, t: THREE.Texture): U {
  const mm = m as THREE.MeshBasicMaterial;
  const p = mm.map;
  mm.map = t;
  mm.needsUpdate = true;
  return () => {
    mm.map = p;
    mm.needsUpdate = true;
  };
}
const matOf = (o: THREE.Object3D) => (o as THREE.Mesh).material as THREE.Material;
function openDoor(h: Hall, i: number, a: number): U {
  const d = h.doors[i];
  return rot(d.pivot, 0, d.side * a, 0);
}
function walker(c: ACtx, w: Partial<WalkerCfg>): U {
  const p = { ...c.walker };
  Object.assign(c.walker, w);
  return () => Object.assign(c.walker, p);
}
function eyesSprite(c: ACtx, x: number, y: number, z: number, s = 0.35, col2 = '#ffe14a'): THREE.Mesh {
  const t = c.ownTex(
    canvasTex(128, 64, (g) => {
      g.fillStyle = col2;
      for (const ex of [36, 92]) {
        g.beginPath();
        g.ellipse(ex, 32, 20, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#1a0420';
      for (const ex of [36, 92]) g.fillRect(ex - 3, 20, 6, 24);
    }),
  );
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.position.set(x, y, z);
  return c.track(m);
}
function decal(c: ACtx, draw: (g: CanvasRenderingContext2D) => void, w: number, h: number, x: number, y: number, z: number, ry: number, rx = 0): THREE.Mesh {
  const t = c.ownTex(canvasTex(256, Math.round((256 * h) / w), draw));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  return c.track(m);
}
function hand(g: CanvasRenderingContext2D, x: number, y: number, s: number, col2: string): void {
  g.fillStyle = col2;
  g.beginPath();
  g.ellipse(x, y, 14 * s, 17 * s, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(x - 12 * s + i * 8 * s, y - 24 * s, 3.5 * s, 9 * s, (i - 1.5) * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(x + 17 * s, y - 2 * s, 4 * s, 9 * s, 0.9, 0, Math.PI * 2);
  g.fill();
}
const WK: [number, number, number] = [-0.75, 1.0, -15.2];

/* ================================ genéricas ================================ */
const GEN: Anom[] = [
  // --- luzes ---
  {
    id: 'light_end_off',
    diff: 1,
    focus: [0, 2.2, -14],
    apply: (c) => all(col(c.h.lamps[4].mat, '#15151a'), col(c.h.lamps[5].mat, '#15151a'), lightI(c.h.lights[2], 0)),
  },
  {
    id: 'light_flicker',
    diff: 1,
    focus: [0, 2.4, -7.2],
    apply: (c) => {
      const L = c.h.lamps[2],
        l = c.h.lights[1];
      let n = 0;
      c.anim((dt, t) => {
        const on = Math.sin(t * 31) + Math.sin(t * 7.3) > 0.2;
        L.mat.color.set(on ? L.base : new THREE.Color('#202028'));
        l.intensity = on ? c.h.lightBase : 0.6;
        if (!on && (n += dt) > 0.4) {
          n = 0;
          c.au.flicker();
        }
      });
      return () => {
        L.mat.color.copy(L.base);
        l.intensity = c.h.lightBase;
      };
    },
  },
  {
    id: 'light_red',
    diff: 1,
    focus: [0, 1.6, -8],
    apply: (c) => all(...c.h.lamps.map((l) => col(l.mat, '#ff4040')), ...c.h.lights.map((l) => lightC(l, '#ff3030'))),
  },
  {
    id: 'light_dim_blue',
    diff: 2,
    focus: [0, 1.6, -8],
    apply: (c) => all(...c.h.lamps.map((l) => col(l.mat, '#7a8cff')), ...c.h.lights.map((l) => lightC(l, '#5a6cff')), ...c.h.lights.map((l) => lightI(l, c.h.lightBase * 0.45))),
  },
  { id: 'light_one_purple', diff: 2, focus: [0, 2.6, -9.8], apply: (c) => all(col(c.h.lamps[3].mat, '#c070ff'), lightC(c.h.lights[1], '#c070ff')) },
  // --- portas ---
  { id: 'door_ajar', diff: 1, focus: [1.2, 1.1, -7.4], apply: (c) => openDoor(c.h, 1, 0.75) },
  {
    id: 'door_eyes',
    diff: 1,
    focus: [-1.3, 1.3, -10.4],
    apply: (c) => {
      const e = eyesSprite(c, -HW + 0.02, 1.45, -10.25, 0.32);
      e.rotation.y = Math.PI / 2;
      c.h.hall.add(e);
      return openDoor(c.h, 2, 0.42);
    },
  },
  {
    id: 'door_num',
    diff: 3,
    focus: [-1.4, 2.3, -4.6],
    apply: (c) => {
      const s = c.h.style;
      const alt = s.id === 'escola' ? '🐼' : s.id === 'metro' ? 'Ɐ' : s.doorNums[0].split('').reverse().join('');
      return tex(c.h.doors[0].numMat, signTex(alt, s.numBg, s.numFg, 128, 64));
    },
  },
  {
    id: 'door_missing',
    diff: 2,
    focus: [1.4, 1.2, -13],
    apply: (c) => {
      const d = c.h.doors[3];
      return all(vis(d.pivot, false), vis(d.num, false), ...d.frame.map((f) => vis(f, false)));
    },
  },
  {
    id: 'door_extra',
    diff: 2,
    focus: [1.4, 1.2, -2.3],
    apply: (c) => {
      const d = c.h.addDoor(1, -2.3, c.h.style.doorNums[3]);
      const objs = [d.pivot, d.num, ...d.frame];
      return () => objs.forEach((o) => o.removeFromParent());
    },
  },
  { id: 'door_color', diff: 2, focus: [-1.4, 1.2, -4.6], apply: (c) => col(c.h.doors[0].mat, '#c0102a') },
  {
    id: 'door_tall',
    diff: 3,
    focus: [1.4, 1.4, -7.4],
    apply: (c) => {
      const d = c.h.doors[1];
      return all(scl(d.pivot, 1, 1.22, 1), pos(d.num, d.num.position.x, 2.75, d.num.position.z), ...d.frame.map((f) => scl(f, 1, 1.22, 1)), ...d.frame.map((f) => pos(f, f.position.x, f.position.y * 1.22, f.position.z)));
    },
  },
  {
    id: 'door_knock',
    diff: 2,
    focus: [1.4, 1.2, -13],
    apply: (c) => {
      const d = c.h.doors[3];
      let k = 0;
      c.anim((dt, t) => {
        const ph = t % 2.6;
        d.pivot.rotation.y = ph < 0.6 ? d.side * Math.abs(Math.sin(ph * 26)) * 0.05 : 0;
        if (ph < dt) c.au.eerie(1, 0.3, 0.9);
        k += dt;
      });
      return () => (d.pivot.rotation.y = 0);
    },
  },
  // --- cartazes ---
  { id: 'poster_alt', diff: 1, focus: [-1.4, 1.5, -7.6], apply: (c) => tex(c.h.posters[1].mat, c.h.posters[1].alt) },
  { id: 'poster_alt2', diff: 2, focus: [1.4, 1.5, -10.4], apply: (c) => tex(c.h.posters[2].mat, c.h.posters[2].alt) },
  {
    id: 'poster_missing',
    diff: 2,
    focus: [1.4, 1.5, -4.4],
    apply: (c) => all(vis(c.h.posters[0].m, false), vis(c.h.posters[0].frame, false)),
  },
  { id: 'poster_upside', diff: 3, focus: [-1.4, 1.5, -13.2], apply: (c) => rot(c.h.posters[3].m, 0, c.h.posters[3].m.rotation.y, Math.PI) },
  {
    id: 'poster_tilt',
    diff: 3,
    focus: [1.4, 1.5, -10.4],
    apply: (c) => {
      const p = c.h.posters[2];
      return all(rot(p.m, 0, p.m.rotation.y, 0.4), rot(p.frame, 0.4, 0, 0));
    },
  },
  {
    id: 'poster_extra',
    diff: 2,
    focus: [-1.4, 1.75, -5.6],
    apply: (c) => {
      const p = c.h.posters[0];
      const m = c.track(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshBasicMaterial({ map: p.tex })));
      m.position.set(-HW + 0.03, 1.8, -5.65);
      m.rotation.y = Math.PI / 2;
      c.h.hall.add(m);
      return () => undefined;
    },
  },
  // --- placas ---
  { id: 'arrow_flip', diff: 2, focus: [0, 2.3, -15.4], apply: (c) => scl(c.h.arrow.mesh, -1, 1, 1) },
  { id: 'arrow_red', diff: 2, focus: [0, 2.3, -15.4], apply: (c) => col(c.h.arrow.mat, '#ff5060') },
  { id: 'norun_bocudo', diff: 2, focus: [-1.4, 1.75, -15], apply: (c) => tex(matOf(c.h.props.noRun), c.ownTex(pictoTex(true))) },
  // --- o espaço ---
  { id: 'ceiling_low', diff: 1, focus: [0, 1.9, -8], apply: (c) => pos(c.h.ceiling, 0, -0.85, 0) },
  { id: 'floor_red', diff: 2, focus: [0, 0.3, -6], apply: (c) => col(c.h.floorMat, '#ff6a6a') },
  { id: 'wall_green', diff: 3, focus: [1.3, 1.8, -6], apply: (c) => col(c.h.wallMat, '#9dffa6') },
  {
    id: 'fog_thick',
    diff: 2,
    focus: [0, 1.5, -10],
    apply: (c) => {
      const f = c.h.fog;
      const p = [f.near, f.far];
      f.near = 0.5;
      f.far = 9;
      return () => ([f.near, f.far] = p);
    },
  },
  {
    id: 'tilt',
    diff: 2,
    focus: [0, 1.5, -8],
    apply: (c) => {
      c.roll.v = 0.09;
      return () => (c.roll.v = 0);
    },
  },
  // --- o Bloop que anda ---
  { id: 'walker_angry', diff: 1, focus: WK, apply: (c) => walker(c, { face: 'angry' }) },
  { id: 'walker_mouth', diff: 1, focus: WK, apply: (c) => walker(c, { face: 'mouth' }) },
  { id: 'walker_noface', diff: 1, focus: WK, apply: (c) => walker(c, { face: 'none' }) },
  { id: 'walker_glow', diff: 2, focus: WK, apply: (c) => walker(c, { face: 'glow' }) },
  { id: 'walker_backwards', diff: 2, focus: WK, apply: (c) => walker(c, { mode: 'backwards' }) },
  { id: 'walker_stare', diff: 1, focus: WK, apply: (c) => walker(c, { mode: 'stare' }) },
  { id: 'walker_giant', diff: 1, focus: WK, apply: (c) => walker(c, { scale: 1.75 }) },
  { id: 'walker_twin', diff: 2, focus: WK, apply: (c) => walker(c, { twin: true }) },
  { id: 'walker_missing', diff: 3, focus: [0, 1, -12], apply: (c) => walker(c, { mode: 'none' }) },
  { id: 'walker_color', diff: 3, focus: WK, apply: (c) => walker(c, { tint: '#3a3a44' }) },
  { id: 'walker_fast', diff: 2, focus: WK, apply: (c) => walker(c, { mode: 'fast' }) },
  // --- visitas ---
  {
    id: 'bocudo_peek',
    diff: 1,
    focus: [1.0, 1.2, -17.6],
    apply: (c) => {
      const b = new Bocudo();
      b.root.scale.setScalar(0.9);
      b.root.position.set(1.0, 0, -17.7);
      c.track(b.root, false);
      c.h.spare.add(b.root);
      c.anim((dt) => {
        const me = c.me();
        b.root.rotation.y = Math.atan2(-(me.x - b.root.position.x), -(me.z - b.root.position.z));
        b.open = 0.25 + Math.max(0, Math.sin(performance.now() / 600)) * 0.4;
        if (me.z < -11.5 && b.root.visible) {
          b.root.visible = false;
          c.au.squeal();
        }
        b.update(dt);
      });
      return () => undefined;
    },
  },
  {
    id: 'shadow_figure',
    diff: 2,
    focus: [0.5, 1.2, -15.6],
    apply: (c) => {
      const g = c.track(new THREE.Group());
      const m = new THREE.MeshBasicMaterial({ color: '#050508' });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), m);
      body.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), m);
      head.position.y = 1.55;
      g.add(body, head);
      const e = eyesSprite(c, 0, 1.58, -0.24, 0.22, '#ff3b3b');
      e.rotation.y = Math.PI;
      g.add(e);
      g.position.set(0.55, 0, -15.6);
      c.h.spare.add(g);
      c.anim(() => {
        const me = c.me();
        if (me.z < -10.5 && g.visible) {
          g.visible = false;
          c.au.whisper(0);
        }
        g.rotation.y = Math.atan2(-(me.x - g.position.x), -(me.z - g.position.z));
      });
      return () => undefined;
    },
  },
  {
    id: 'balloon',
    diff: 1,
    focus: [0.3, 1.6, -8.5],
    apply: (c) => {
      const g = c.track(new THREE.Group());
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshLambertMaterial({ color: '#ff2a3a' }));
      bl.scale.y = 1.2;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.9, 0.008), new THREE.MeshBasicMaterial({ color: '#eee' }));
      st.position.y = -0.7;
      g.add(bl, st);
      g.position.set(0.3, 1.7, -8.5);
      c.h.spare.add(g);
      c.anim((_, t) => {
        g.position.y = 1.7 + Math.sin(t * 1.4) * 0.08;
        g.rotation.z = Math.sin(t * 0.9) * 0.1;
      });
      return () => undefined;
    },
  },
  {
    id: 'handprints',
    diff: 2,
    focus: [-1.45, 1.2, -9],
    apply: (c) => {
      const m = decal(
        c,
        (g) => {
          for (let i = 0; i < 5; i++) hand(g, 30 + i * 48, 80 + (i % 2) * 40 - i * 6, 1.1, 'rgba(40,20,60,.75)');
        },
        1.4,
        0.8,
        -HW + 0.02,
        1.25,
        -8.9,
        Math.PI / 2,
      );
      c.h.hall.add(m);
      return () => undefined;
    },
  },
  {
    id: 'footprints',
    diff: 2,
    focus: [0.6, 0.1, -9],
    apply: (c) => {
      const m = decal(
        c,
        (g) => {
          g.fillStyle = 'rgba(30,20,40,.7)';
          for (let i = 0; i < 8; i++) {
            g.beginPath();
            g.ellipse(70 + (i % 2) * 50, 980 - i * 120, 18, 30, 0, 0, Math.PI * 2);
            g.fill();
          }
        },
        0.9,
        4,
        0.85,
        0.008,
        -9.5,
        0,
        -Math.PI / 2,
      );
      c.h.hall.add(m);
      return () => undefined;
    },
  },
  {
    id: 'drip',
    diff: 3,
    focus: [0.4, 0.2, -6.8],
    apply: (c) => {
      const pud = decal(
        c,
        (g) => {
          g.fillStyle = 'rgba(60,90,140,.55)';
          g.beginPath();
          g.ellipse(128, 128, 120, 80, 0, 0, Math.PI * 2);
          g.fill();
        },
        0.9,
        0.9,
        0.4,
        0.008,
        -6.8,
        0,
        -Math.PI / 2,
      );
      const drop = c.track(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#9fd8ff' })));
      c.h.hall.add(pud, drop);
      const H = c.h.style.H;
      c.anim((dt, t) => {
        const k = (t % 1.1) / 1.1;
        drop.position.set(0.4, H - k * k * H, -6.8);
        if ((t + dt) % 1.1 < dt) c.au.tone(1400, 0.06, 'sine', 0.03, { slide: 0.5 });
      });
      return () => undefined;
    },
  },
  // --- objetos comuns ---
  { id: 'ext_missing', diff: 2, focus: [-1.4, 1.0, -6.2], apply: (c) => vis(c.h.props.extinguisher, false) },
  { id: 'ext_color', diff: 3, focus: [-1.4, 1.0, -6.2], apply: (c) => col(matOf(c.h.props.extinguisher.children[0]), '#2a6bff') },
  {
    id: 'clock_spin',
    diff: 2,
    focus: [1.4, 2.2, -9],
    apply: (c) => {
      const hh = c.h.props.clockH,
        mh = c.h.props.clockM;
      const p = [hh.rotation.x, mh.rotation.x];
      c.anim((dt) => {
        mh.rotation.x -= dt * 9;
        hh.rotation.x -= dt * 0.75;
      });
      return () => ((hh.rotation.x = p[0]), (mh.rotation.x = p[1]));
    },
  },
  {
    id: 'clock_back',
    diff: 3,
    focus: [1.4, 2.2, -9],
    apply: (c) => {
      const hh = c.h.props.clockH,
        mh = c.h.props.clockM;
      const p = [hh.rotation.x, mh.rotation.x];
      hh.rotation.x = 2.2;
      mh.rotation.x = -2.5;
      c.anim((dt) => (mh.rotation.x += dt * 1.6));
      return () => ((hh.rotation.x = p[0]), (mh.rotation.x = p[1]));
    },
  },
  {
    id: 'cam_follow',
    diff: 2,
    focus: [1.2, 2.5, -15.2],
    apply: (c) => {
      const cam = c.h.props.camera;
      const p = cam.rotation.clone();
      c.anim(() => {
        const me = c.me();
        const dx = me.x - cam.position.x,
          dz = me.z - cam.position.z;
        cam.rotation.set(-0.3, Math.atan2(dx, dz), 0, 'YXZ');
      });
      return () => cam.rotation.copy(p);
    },
  },
  {
    id: 'vent_eyes',
    diff: 2,
    focus: [-0.7, 2.6, -11.2],
    apply: (c) => {
      const e = eyesSprite(c, -0.7, c.h.style.H - 0.06, -11.2, 0.3);
      e.rotation.x = Math.PI / 2;
      c.h.hall.add(e);
      return all(rot(c.h.props.vent, 0.6, 0, 0), pos(c.h.props.vent, -0.7, c.h.style.H - 0.25, -11.0));
    },
  },
  {
    id: 'bin_tipped',
    diff: 2,
    focus: [-1.2, 0.3, -12],
    apply: (c) => {
      const b = c.h.props.bin;
      return all(rot(b, 0, 0, Math.PI / 2), pos(b, -HW + 0.4, 0.17, -12));
    },
  },
  {
    id: 'bin_float',
    diff: 2,
    focus: [-1.2, 1.0, -12],
    apply: (c) => {
      const b = c.h.props.bin;
      const p = b.position.clone();
      c.anim((_, t) => {
        b.position.y = 1.0 + Math.sin(t * 1.3) * 0.15;
        b.rotation.y = t * 0.6;
      });
      return () => {
        b.position.copy(p);
        b.rotation.set(0, 0, 0);
      };
    },
  },
  { id: 'bench_middle', diff: 2, focus: [0, 0.5, -5], apply: (c) => all(pos(c.h.props.bench, 0.1, 0, -5.2), rot(c.h.props.bench, 0, 0.5, 0)) },
  {
    id: 'plant_dead',
    diff: 3,
    focus: [1.2, 0.8, -15.2],
    apply: (c) => all(col(matOf(c.h.props.plantLeaf), '#6a5030'), scl(c.h.props.plantLeaf, 1.1, 0.7, 1.1), pos(c.h.props.plantLeaf, 0, 0.55, 0)),
  },
  {
    id: 'plant_big',
    diff: 2,
    focus: [1.2, 1.2, -15.2],
    apply: (c) => scl(c.h.props.plantLeaf, 2.0, 3.0, 2.0),
  },
];

function lightI(l: THREE.PointLight, v: number): U {
  const p = l.intensity;
  l.intensity = v;
  return () => (l.intensity = p);
}
function lightC(l: THREE.PointLight, c: string): U {
  const p = l.color.clone();
  l.color.set(c);
  return () => l.color.copy(p);
}

/* ================================ por tema ================================ */
const THEMED: Anom[] = [
  // hospital
  {
    id: 'h_wheelchair_roll',
    theme: 'hospital',
    diff: 1,
    focus: [-1.0, 0.6, -8.8],
    apply: (c) => {
      const w = c.h.props.wheelchair;
      const p = w.position.clone(),
        r = w.rotation.clone();
      w.rotation.y = Math.PI;
      c.anim((dt) => {
        const me = c.me();
        if (me.z < -1.5 && w.position.z < me.z + 2.5) w.position.z += dt * 0.6;
      });
      return () => {
        w.position.copy(p);
        w.rotation.copy(r);
      };
    },
  },
  {
    id: 'h_gurney_lump',
    theme: 'hospital',
    diff: 2,
    focus: [1.0, 0.9, -11.6],
    apply: (c) => {
      const l = c.h.props.gurneyLump;
      c.anim((_, t) => (l.scale.y = 0.35 + Math.sin(t * 2.2) * 0.05));
      return vis(l, true);
    },
  },
  { id: 'h_iv_middle', theme: 'hospital', diff: 3, focus: [0, 1, -14], apply: (c) => pos(c.h.props.iv, 0.1, 0, -13.8) },
  { id: 'h_cross_green', theme: 'hospital', diff: 3, focus: [0, 2.4, -9.5], apply: (c) => tex(matOf(c.h.props.crossSign), signTex('✚', '#ffffff', '#1fae5b', 256, 256)) },
  { id: 'h_xray', theme: 'hospital', diff: 2, focus: [-1.4, 1.6, -2.9], apply: (c) => tex(matOf(c.h.props.xray), (c.h.props.xray.userData as { alt: THREE.Texture }).alt) },
  { id: 'h_wheelchair_flip', theme: 'hospital', diff: 2, focus: [-1.0, 0.6, -8.8], apply: (c) => all(rot(c.h.props.wheelchair, Math.PI, Math.PI / 2, 0), pos(c.h.props.wheelchair, -HW + 0.45, 1.05, -8.8)) },
  // hotel
  { id: 'o_cart_middle', theme: 'hotel', diff: 2, focus: [0, 0.8, -8], apply: (c) => all(pos(c.h.props.cart, 0.1, 0, -8), rot(c.h.props.cart, 0, 0.7, 0)) },
  {
    id: 'o_cloche_eyes',
    theme: 'hotel',
    diff: 1,
    focus: [-1.0, 1.0, -8.5],
    apply: (c) => {
      const e = eyesSprite(c, -HW + 0.4, 0.92, -8.45, 0.22);
      e.rotation.y = Math.PI / 2;
      c.h.hall.add(e);
      const cl = c.h.props.cloche;
      return all(pos(cl, 0, 1.08, 0.15), rot(cl, 0, 0, 0.6));
    },
  },
  { id: 'o_flowers_dead', theme: 'hotel', diff: 3, focus: [1.2, 1.0, -12.2], apply: (c) => all(...c.h.props.flowers.children.map((f) => col(matOf(f), '#5a5048'))) },
  { id: 'o_dnd_gone', theme: 'hotel', diff: 3, focus: [-1.4, 0.9, -4], apply: (c) => vis(c.h.props.dnd, false) },
  { id: 'o_painting', theme: 'hotel', diff: 2, focus: [1.4, 1.6, -15], apply: (c) => tex(matOf(c.h.props.bigPainting), (c.h.props.bigPainting.userData as { alt: THREE.Texture }).alt) },
  { id: 'o_carpet_blue', theme: 'hotel', diff: 2, focus: [0, 0.2, -6], apply: (c) => tex(c.h.floorMat, (c.h.props.carpetAlt.userData as { tex: THREE.Texture }).tex) },
  // escola
  {
    id: 'e_locker_open',
    theme: 'escola',
    diff: 1,
    focus: [-1.2, 1.0, -8.6],
    apply: (c) => {
      const d = c.h.props.lockerDoor;
      const e = eyesSprite(c, -HW + 0.4, 1.35, -8.6 + 0.22, 0.22);
      e.rotation.y = Math.PI / 2;
      c.h.hall.add(e);
      return all(rot(d, 0, -1.2, 0), pos(d, d.position.x + 0.15, d.position.y, d.position.z + 0.2));
    },
  },
  { id: 'e_backpack_floor', theme: 'escola', diff: 2, focus: [1.0, 0.2, -11.8], apply: (c) => all(pos(c.h.props.backpack, HW - 0.4, 0.09, -11.6), rot(c.h.props.backpack, Math.PI / 2, 0.4, 0)) },
  {
    id: 'e_ball_roll',
    theme: 'escola',
    diff: 2,
    focus: [-1.0, 0.2, -13.6],
    apply: (c) => {
      const b = c.h.props.ball;
      const p = b.position.clone();
      c.anim((dt) => {
        const me = c.me();
        if (me.z < -1.5 && b.position.z < me.z - 1.2) {
          b.position.z += dt * 0.9;
          b.position.x += (0 - b.position.x) * dt * 0.4;
          b.rotation.x += dt * 5.6;
        }
      });
      return () => {
        b.position.copy(p);
        b.rotation.set(0, 0, 0);
      };
    },
  },
  {
    id: 'e_chairs_tower',
    theme: 'escola',
    diff: 2,
    focus: [1.1, 1.2, -6.4],
    apply: (c) => {
      const ch = c.h.props.chairs;
      const extra: THREE.Object3D[] = [];
      for (let i = 3; i < 9; i++) {
        const k = ch.children[i % 3].clone();
        k.position.y = i * 0.12;
        k.rotation.y = (i % 2) * 0.3;
        ch.add(k);
        extra.push(k);
      }
      return () => extra.forEach((e) => e.removeFromParent());
    },
  },
  {
    id: 'e_drawings',
    theme: 'escola',
    diff: 1,
    focus: [0, 2.2, -10],
    apply: (c) => {
      const u = c.h.props.drawings.userData as { alts: THREE.Texture[]; ms: THREE.Mesh[] };
      return all(...u.ms.map((m, i) => tex(m.material as THREE.Material, u.alts[i])));
    },
  },
  { id: 'e_class_sign', theme: 'escola', diff: 3, focus: [1.4, 2.3, -15.1], apply: (c) => tex(matOf(c.h.props.classSign), signTex('🦷 👁️ 🌑', '#ffffff', '#1d0b3a', 256, 94)) },
  // metrô
  {
    id: 'm_vending_red',
    theme: 'metro',
    diff: 1,
    focus: [1.2, 1.2, -9],
    apply: (c) => {
      const e = eyesSprite(c, HW - 0.66, 1.25, -9, 0.34, '#ff3b3b');
      e.rotation.y = -Math.PI / 2;
      c.h.hall.add(e);
      return col(matOf(c.h.props.vendingGlass), '#ff2a3a');
    },
  },
  { id: 'm_map', theme: 'metro', diff: 3, focus: [-1.4, 1.7, -3.2], apply: (c) => tex(matOf(c.h.props.lineMap), (c.h.props.lineMap.userData as { alt: THREE.Texture }).alt) },
  { id: 'm_tactile_gone', theme: 'metro', diff: 2, focus: [-0.75, 0.05, -8], apply: (c) => vis(c.h.props.tactile, false) },
  {
    id: 'm_pillar_extra',
    theme: 'metro',
    diff: 2,
    focus: [0, 1.4, -8.4],
    apply: (c) => {
      const p = c.track((c.h.props.pillar as THREE.Mesh).clone(), false);
      p.position.set(0, p.position.y, -8.4);
      c.h.hall.add(p);
      return () => undefined;
    },
  },
  {
    id: 'm_turnstile',
    theme: 'metro',
    diff: 2,
    focus: [-0.8, 0.9, -15.6],
    apply: (c) => {
      const a = c.h.props.turnArm;
      const p = a.rotation.clone();
      c.anim((dt) => (a.rotation.x += dt * 6));
      return () => a.rotation.copy(p);
    },
  },
  { id: 'm_depart', theme: 'metro', diff: 3, focus: [1.4, 2.4, -6.8], apply: (c) => tex(matOf(c.h.props.depart), signTex('🚇 👁️ min', '#1d1d2a', '#ff3b3b', 256, 85)) },
];

export const ANOMS: Anom[] = [...GEN, ...THEMED];

/** pool por tema e nível (níveis baixos: só as bem visíveis) */
export function poolFor(theme: ThemeId, level: number): Anom[] {
  const maxD = level <= 2 ? 1 : level <= 5 ? 2 : 3;
  return ANOMS.filter((a) => (!a.theme || a.theme === theme) && a.diff <= maxD);
}

/** faces do walker */
export function applyWalker(m: NpcBloop, w: WalkerCfg): void {
  m.setFace(w.face);
  m.setTint(w.tint);
  m.root.scale.setScalar(w.scale);
}
