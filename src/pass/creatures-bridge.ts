/* ============================================================
 *  PONTE com o módulo de criaturas (escrito em paralelo).
 *  Usa import.meta.glob: se src/creatures/catalog.ts / render.ts ainda
 *  não existirem, nada quebra (fallback desenhado aqui). Quando existirem,
 *  são carregados sob demanda automaticamente.
 *  Contrato: seasonCreatures(i): SeasonCreatures; renderCreatureIcon(id, px).
 * ============================================================ */
import type { SeasonCreatures } from '../creatures/api';
import { creatureNames, creatureRealIds, realCreatureId, rng, type PassRarity } from './catalog';

const catalogMods = import.meta.glob('../creatures/catalog.ts');
const renderMods = import.meta.glob('../creatures/render.ts');

type CatalogMod = { seasonCreatures?: (i: number) => SeasonCreatures };
type RenderMod = { renderCreatureIcon?: (id: string, px: number) => HTMLCanvasElement | HTMLElement | string };

let cat: Promise<CatalogMod | null> | null = null;
let ren: Promise<RenderMod | null> | null = null;

function loadCat(): Promise<CatalogMod | null> {
  const k = Object.keys(catalogMods)[0];
  cat ??= k ? (catalogMods[k]() as Promise<CatalogMod>).catch(() => null) : Promise.resolve(null);
  return cat;
}
function loadRen(): Promise<RenderMod | null> {
  const k = Object.keys(renderMods)[0];
  ren ??= k ? (renderMods[k]() as Promise<RenderMod>).catch(() => null) : Promise.resolve(null);
  return ren;
}

/** Preenche creatureNames com os nomes reais da temporada (se o catálogo existir). */
export async function loadSeasonCreatureNames(index: number): Promise<SeasonCreatures | null> {
  const m = await loadCat();
  const sc = m?.seasonCreatures?.(index) ?? null;
  if (sc)
    for (const r of ['common', 'medio', 'rare', 'epic', 'legendary'] as const) {
      const k = `s${String(index).padStart(2, '0')}-${r}`;
      creatureNames.set(k, sc[r].name);
      creatureRealIds.set(k, sc[r].id);
    }
  return sc;
}

/** Ícone da criatura: do render real, ou um bichinho-fallback fofo (bolinha com orelhas). */
export async function creatureIcon(id: string, px: number, palette: [string, string, string], rarity: PassRarity): Promise<HTMLElement> {
  const m = await loadRen();
  if (m?.renderCreatureIcon) {
    try {
      const out = m.renderCreatureIcon(realCreatureId(id), px);
      if (typeof out === 'string') {
        const span = document.createElement('span');
        span.innerHTML = out;
        return span;
      }
      return out;
    } catch {
      /* cai no fallback */
    }
  }
  return fallbackCreature(id, px, palette, rarity);
}

function fallbackCreature(id: string, px: number, palette: [string, string, string], rarity: PassRarity): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(px * dpr);
  c.style.width = c.style.height = px + 'px';
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = rng(h);
  const [, a, b] = palette;
  const body = r() < 0.5 ? a : b;
  const R = px * 0.3;
  const cx = px / 2;
  const cy = px * 0.56;
  // orelhas/antenas
  x.fillStyle = body;
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = px * 0.035;
  const ears = Math.floor(r() * 3);
  for (const sd of [-1, 1]) {
    x.beginPath();
    if (ears === 0) x.ellipse(cx + sd * R * 0.6, cy - R * 0.85, R * 0.22, R * 0.4, sd * 0.4, 0, Math.PI * 2);
    else if (ears === 1) {
      x.moveTo(cx + sd * R * 0.3, cy - R * 0.7);
      x.lineTo(cx + sd * R * 0.75, cy - R * 1.25);
      x.lineTo(cx + sd * R * 0.9, cy - R * 0.45);
    } else x.arc(cx + sd * R * 0.7, cy - R * 0.8, R * 0.25, 0, Math.PI * 2);
    x.fill();
    x.stroke();
  }
  const g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, body);
  g.addColorStop(1, mix(body));
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(cx, cy, R * 1.05, R * 0.95, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  // rosto
  x.fillStyle = '#2a0b5c';
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.arc(cx + sd * R * 0.36, cy - R * 0.08, R * 0.15, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#ffffff';
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.arc(cx + sd * R * 0.36 - R * 0.05, cy - R * 0.14, R * 0.055, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = 'rgba(255,120,170,.6)';
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + sd * R * 0.62, cy + R * 0.14, R * 0.13, R * 0.08, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = px * 0.025;
  x.beginPath();
  x.arc(cx, cy + R * 0.12, R * 0.14, 0.2, Math.PI - 0.2);
  x.stroke();
  if (rarity === 'legendary') {
    // coroinha do "rei" da temporada
    x.fillStyle = '#ffd84a';
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = px * 0.025;
    x.beginPath();
    const y0 = cy - R * 0.95;
    x.moveTo(cx - R * 0.4, y0);
    x.lineTo(cx - R * 0.45, y0 - R * 0.4);
    x.lineTo(cx - R * 0.2, y0 - R * 0.2);
    x.lineTo(cx, y0 - R * 0.5);
    x.lineTo(cx + R * 0.2, y0 - R * 0.2);
    x.lineTo(cx + R * 0.45, y0 - R * 0.4);
    x.lineTo(cx + R * 0.4, y0);
    x.closePath();
    x.fill();
    x.stroke();
  }
  return c;
}

function mix(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
