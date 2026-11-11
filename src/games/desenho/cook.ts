/* DESENHA E VIRA! — "cozinha" uma receita (traços + material) em malha+física,
 * e os efeitos do BUM! (papel que levanta, estouro de texto, brilhos, som, vibração). */
import * as THREE from 'three';
import { tap } from '../../core/haptics';
import { sfx } from '../../3d/common/sfx';
import type { Particles } from '../../3d/common/particles';
import { t } from '../../i18n';
import { analyze, type Analysis } from './analyze';
import { build, type Built, type Mapping } from './build';
import { MESH_N } from './drawui';
import { renderDrawing } from './paper';
import { shareCode, type Drawing, type Material } from './strokes';

export const FLAG_VEHICLE = 1;
export const FLAG_FLY = 2;

export function codeOf(d: Drawing, mat: Material, vehicle: boolean, fly: boolean): string {
  return shareCode(d, mat, (vehicle ? FLAG_VEHICLE : 0) | (fly ? FLAG_FLY : 0));
}

export function cook(d: Drawing, mat: Material, o: { tier: number; map: Mapping; vehicle?: boolean; flat?: boolean; forceWheels?: boolean; art?: HTMLCanvasElement; k?: number; an?: Analysis | null }): { built: Built; an: Analysis } | null {
  let art = o.art;
  let k = o.k ?? 1.5;
  if (!art) {
    k = 1.5;
    art = document.createElement('canvas');
    art.width = Math.round(d.w * k);
    art.height = Math.round(d.h * k);
    renderDrawing(art.getContext('2d', { willReadFrequently: true })!, d, k);
  }
  const an = o.an ?? analyze(d, art, k, MESH_N[o.tier] ?? 56);
  if (!an) return null;
  const built = build(d, art, k, an, { mat, map: o.map, tier: o.tier, vehicle: o.vehicle, flat: o.flat, forceWheels: o.forceWheels });
  return built ? { built, an } : null;
}

/* ----------------------------- efeitos do BUM ----------------------------- */

/** texto em estouro de quadrinho no ponto (px, relativo ao host) */
export function bumBurst(host: HTMLElement, x: number, y: number, colors: string[]): void {
  const el = document.createElement('div');
  el.className = 'dv-burst';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.setProperty('--c1', colors[0] ?? '#ffd93d');
  el.style.setProperty('--c2', colors[1] ?? '#ff6fc8');
  const spikes = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 38 : 50;
    return `${50 + Math.cos(a) * r}% ${50 + Math.sin(a) * r}%`;
  }).join(',');
  el.innerHTML = `<i style="clip-path:polygon(${spikes})"></i><b>${t('dv.bum', 'BUM!')}</b>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

export function flash(host: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'dv-flash';
  host.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

/** o papel descola e voa para o mundo (folha do ateliê) */
export function liftPaper(el: HTMLElement): Promise<void> {
  return new Promise((res) => {
    el.classList.add('dv-lift');
    setTimeout(() => {
      el.classList.remove('dv-lift');
      res();
    }, 520);
  });
}

export function bumSound(): void {
  sfx.whoosh();
  setTimeout(() => sfx.poof(), 120);
  setTimeout(() => sfx.boing(), 260);
  setTimeout(() => sfx.sparkle(), 420);
  tap('heavy');
}

export function bumParticles(p: Particles, at: THREE.Vector3, size: number, colors: string[]): void {
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = colors[i % colors.length] ?? '#ffffff';
    p.emit(at.x, at.y, at.z, Math.cos(a) * 3.2 * size, Math.sin(a) * 3.2 * size, (Math.random() - 0.5) * 1.5, { tile: 1, color: c, life: 0.7 + Math.random() * 0.4, size: 0.12 * Math.max(0.6, size), grav: 1.5, drag: 2.2 });
  }
  p.burst(at.x, at.y, at.z, 14, 'poof', '#ffffff', 1.4 * size);
  for (let i = 0; i < 18; i++) p.emit(at.x, at.y, at.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, { tile: 3, color: colors[i % colors.length] ?? '#ffd93d', life: 1.2, size: 0.06, grav: 7, drag: 0.6 });
}

export function landFx(p: Particles, at: THREE.Vector3, v: number): void {
  p.burst(at.x, at.y, at.z, Math.min(12, 3 + v * 2), 'poof', '#f4ead8', 0.8);
  sfx.thud();
  tap(v > 3 ? 'medium' : 'light');
}
