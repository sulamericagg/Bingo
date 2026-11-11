/* ============================================================
 *  GARIMPO BRUTO — água: modelos (poço, bomba com gerador, cano, dinamite, cano da represa)
 *  e ícones SVG no mesmo estilo de icons.ts (traço branco grosso).
 * ============================================================ */
import * as THREE from 'three';
import { Kit } from '../kit';
import { C } from '../models';
import type { Terrain } from '../terrain';

const S = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const WIC = {
  drop: S('<path d="M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z" fill="#5ab8ff" stroke="#fff"/>'),
  dyn: S('<rect x="5" y="9" width="4" height="11" rx="1" fill="#e2332a"/><rect x="10" y="9" width="4" height="11" rx="1" fill="#e2332a"/><path d="M12 9c0-3 2-4 4-5"/><path d="M17 2l1 2 2 0-1.5 1.5.5 2-2-1-2 1 .5-2L14 4h2z" fill="#ffd23a" stroke="#ffd23a" stroke-width="1"/>'),
  well: S('<path d="M5 12h14v8H5z" fill="#8a8f96"/><path d="M5 15h14M9 12v8M15 12v8" stroke="#555"/><path d="M6 12V6M18 12V6M4 6l8-3 8 3"/><path d="M12 6v4"/>'),
  pump: S('<rect x="3" y="9" width="12" height="9" rx="1.5" fill="#f2b20f" stroke="#fff"/><circle cx="9" cy="13.5" r="2.5"/><path d="M15 12h4v-3h2M15 15h6"/><path d="M5 9V6h4"/>'),
  pipe: S('<path d="M3 16h7a3 3 0 0 0 3-3V8h8" stroke-width="3.2"/><path d="M3 13v6M21 5v6"/>'),
  fuel: S('<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M7 9h5"/><path d="M15 9l3 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>'),
  end: S('<circle cx="12" cy="12" r="8"/><path d="M8 12l3 3 5-6"/>'),
  cancel: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  dam: S('<path d="M2 18c4-1 6-6 10-6s6 5 10 6"/><path d="M4 18V9h16v9" /><path d="M7 12c1.5 1 3 1 4.5 0s3-1 4.5 0" stroke="#5ab8ff"/>'),
  tank: S('<rect x="6" y="4" width="12" height="16" rx="3"/><path d="M6 13h12" stroke="#5ab8ff"/>'),
};

export function buildWell(): THREE.Group {
  const k = new Kit({ y: 0.3, k: 0.3 });
  k.cyl(1.0, 1.1, 0.8, C.concrete, 0, 0.4, 0, 14);
  k.cyl(0.78, 0.78, 0.82, 0x1d3440, 0, 0.42, 0, 14);
  for (const sx of [0.95, -0.95]) k.box(0.14, 1.9, 0.14, C.wood, sx, 1.3, 0);
  k.rbox(2.4, 0.12, 1.4, 0.04, C.roof, 0, 2.3, 0.35, 0.45, 0, 0);
  k.rbox(2.4, 0.12, 1.4, 0.04, C.roof, 0, 2.3, -0.35, -0.45, 0, 0);
  k.cylX(0.1, 1.9, C.woodL, 0, 1.6, 0);
  k.box(0.08, 0.5, 0.08, C.steel, 1.0, 1.4, 0.2);
  k.cyl(0.18, 0.15, 0.3, C.steelD, 0, 1.0, 0, 8);
  return k.build();
}
export function buildPump(): THREE.Group {
  const k = new Kit({ y: 0.3, k: 0.4 });
  k.rbox(1.7, 0.18, 1.1, 0.04, C.steelD, 0, 0.09, 0);
  // gerador a diesel
  k.rbox(0.9, 0.7, 0.9, 0.08, C.yellow, -0.35, 0.55, 0);
  k.rbox(0.5, 0.25, 0.7, 0.05, C.dark, -0.35, 1.0, 0);
  k.cyl(0.05, 0.05, 0.5, C.steel, -0.65, 1.2, 0.3, 6);
  // bomba centrífuga
  k.cylX(0.32, 0.4, C.teal, 0.45, 0.45, 0, 14);
  k.cylX(0.12, 0.5, C.steel, 0.85, 0.45, 0);
  k.cyl(0.1, 0.1, 0.5, C.steel, 0.45, 0.85, 0, 8);
  k.decal('warn', 0.3, 0.3, -0.35, 0.6, 0.46);
  return k.build();
}
export function buildDynamite(): THREE.Group {
  const k = new Kit();
  for (let i = 0; i < 3; i++) k.cyl(0.07, 0.07, 0.42, C.red, (i - 1) * 0.15, 0.21, 0, 8);
  k.box(0.48, 0.06, 0.16, C.black, 0, 0.3, 0);
  k.use('glow').ball(0.06, 0xffd23a, 0.05, 0.55, 0);
  return k.build(false);
}

const pipeMat = new THREE.MeshPhongMaterial({ color: 0x2b5f8a, shininess: 40 });
const pipeMatOutlet = new THREE.MeshPhongMaterial({ color: 0x5c5f63, shininess: 30 });
/** cano deitado no chão entre dois pontos (segue o terreno, levantado 0,2 m) */
export function buildPipe(T: Terrain, ax: number, az: number, bx: number, bz: number, outlet = false): THREE.Mesh {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.min(60, Math.ceil(L / 2.5)));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // nunca enterra: maior altura do terreno perto do ponto
    let y = -1e9;
    for (const o of [-0.6, 0, 0.6]) y = Math.max(y, T.heightAt(x + ((bx - ax) / L) * o, z + ((bz - az) / L) * o));
    pts.push(new THREE.Vector3(x, y + (outlet ? 0.3 : 0.2), z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, n * 2, outlet ? 0.2 : 0.13, 6, false);
  const m = new THREE.Mesh(g, outlet ? pipeMatOutlet : pipeMat);
  m.castShadow = false;
  return m;
}
