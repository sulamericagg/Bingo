/* ============================================================
 *  JANGADA BLOOP — corais e algas (low-poly, cor por vértice).
 *  Um "canteiro" = poucas peças juntas (galhos, cérebro, leque, tubos,
 *  algas) já posicionadas no mundo/local; quem chama junta tudo numa
 *  malha só (ilha: 1 malha; fundo aberto: entra na malha do fundo).
 * ============================================================ */
import * as THREE from 'three';
import { box, clean, cone, cyl, merge, paint, sph } from './models';

const PINK = ['#ff7aa8', '#ff9a6a', '#c88aff', '#ffd25a', '#ff5c7a', '#7ae0d0'];
/** canteiro de coral em (x, y, z) — y = chão; r() = sorteio determinístico 0..1 */
export function coralCluster(r: () => number, x: number, y: number, z: number, s = 1): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = i ? 0.35 + r() * 0.7 : 0;
    const px = x + Math.cos(a) * d * s;
    const pz = z + Math.sin(a) * d * s;
    const col = PINK[Math.floor(r() * PINK.length)];
    const k = r();
    const sc = s * (0.7 + r() * 0.6);
    if (k < 0.32) {
      // galhos (chifre de veado)
      for (let b = 0; b < 4; b++) {
        const ba = b * 1.6 + r();
        const tilt = 0.35 + r() * 0.35;
        const h = (0.5 + r() * 0.45) * sc;
        L.push(cyl(0.035 * sc, 0.06 * sc, h, col, px + Math.cos(ba) * 0.09 * sc, y + h * 0.45, pz + Math.sin(ba) * 0.09 * sc, Math.sin(ba) * tilt, 0, -Math.cos(ba) * tilt, 5));
        L.push(sph(0.05 * sc, col, px + Math.cos(ba) * (0.09 + h * 0.33) * sc, y + h * 0.9, pz + Math.sin(ba) * (0.09 + h * 0.33) * sc, 1, 1, 1, 5));
      }
    } else if (k < 0.55) {
      // coral-cérebro
      L.push(sph(0.32 * sc, col, px, y + 0.1 * sc, pz, 1, 0.62, 1, 8));
    } else if (k < 0.72) {
      // leque
      const g = new THREE.CircleGeometry(0.42 * sc, 8, 0, Math.PI);
      g.rotateY(r() * Math.PI);
      g.translate(px, y + 0.02, pz);
      L.push(clean(paint(g, '#b06ae8', 0.15)));
      // face de trás (o leque é fino: dois lados)
      L.push(clean(paint(flip(g.clone()), '#9a5ad8', 0.1)));
    } else if (k < 0.86) {
      // tubos
      for (let b = 0; b < 3; b++) {
        const h = (0.25 + r() * 0.35) * sc;
        L.push(cyl(0.07 * sc, 0.08 * sc, h, col, px + (b - 1) * 0.13 * sc, y + h / 2, pz + (r() - 0.5) * 0.15, 0, 0, 0, 6));
      }
    } else {
      // tufo de alga
      for (let b = 0; b < 4; b++) {
        const h = (0.6 + r() * 0.9) * sc;
        const ba = b * 1.7 + r();
        L.push(box(0.08, h, 0.02, b % 2 ? '#2f9a5e' : '#4ab86a', px + Math.cos(ba) * 0.12, y + h / 2 - 0.04, pz + Math.sin(ba) * 0.12, Math.sin(ba) * 0.15, ba, Math.cos(ba) * 0.15, 0.1));
      }
    }
  }
  // conchinha / estrela-do-mar de vez em quando
  if (r() < 0.35) L.push(cone(0.12 * s, 0.04, '#ff8a3a', x + 0.4 * s, y + 0.02, z - 0.3 * s, 0, r() * 6, 0, 5));
  return merge(L);
}
/** mesma superfície virada para o outro lado (inverte triângulos e normais) */
function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
  }
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}
