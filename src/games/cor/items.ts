/* ============================================================
 *  PINTOU, GANHOU! — catálogo de itens (gerado dos dados em texto)
 *  + sorteio das rodadas (dificuldade crescente, tons parecidos no fim).
 * ============================================================ */
import { getLang } from '../../i18n';
import { chroma, colorDifficulty, hexToRgb, lightness, rgbToHsv } from './color';
import { DATA_A } from './items-a';
import { DATA_B } from './items-b';
import { DATA_C } from './items-c';
import { DATA_D } from './items-d';
import { hasShape } from './shapes';

export interface Cat {
  id: string;
  pt: string;
  en: string;
  shape: string;
  n: number;
}
export interface Item {
  idx: number;
  pt: string;
  en: string;
  cat: Cat;
  hex: string;
  sec: string;
  shape: string;
  /** 0 fácil .. 2 difícil */
  diff: 0 | 1 | 2;
  hue: number;
  L: number;
  C: number;
}

export const CATS: Cat[] = [];
export const ITEMS: Item[] = [];

function parse(src: string): void {
  let cat: Cat | null = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split('|');
    if (line[0] === '#') {
      cat = { id: f[0].slice(1), pt: f[1], en: f[2], shape: f[3] || 'ball', n: 0 };
      CATS.push(cat);
      continue;
    }
    if (!cat || f.length < 3) continue;
    const hex = '#' + f[2].trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) continue;
    const sec = f[3]?.trim() ? '#' + f[3].trim().toLowerCase() : '';
    let shape = f[4]?.trim() || cat.shape;
    if (!hasShape(shape)) shape = cat.shape;
    const hsv = rgbToHsv(hexToRgb(hex));
    ITEMS.push({ idx: ITEMS.length, pt: f[0].trim(), en: f[1].trim() || f[0].trim(), cat, hex, sec, shape, diff: colorDifficulty(hex), hue: hsv.h, L: lightness(hex), C: chroma(hex) });
    cat.n++;
  }
}
parse(DATA_A);
parse(DATA_B);
parse(DATA_C);
parse(DATA_D);

const pt = () => getLang() === 'pt';
export const itemName = (it: Item): string => (pt() ? it.pt : it.en);
export const catName = (c: Cat): string => (pt() ? c.pt : c.en);

/** distância de tom (graus) */
export const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Sorteia `n` itens para uma rodada.
 * - começa com cores vivas/fáceis e vai endurecendo (pastéis, escuros, "sujos");
 * - da metade em diante, tenta escolher um tom vizinho do item anterior (pegadinha);
 * - `level` (0..3) puxa tudo para o difícil; `cat` restringe a uma categoria.
 */
export function pickRound(rng: () => number, n: number, opts: { level?: number; cat?: string; avoid?: Set<number> } = {}): Item[] {
  const level = opts.level ?? 1;
  const pool = ITEMS.filter((it) => (!opts.cat || it.cat.id === opts.cat) && !opts.avoid?.has(it.idx));
  const src = pool.length >= n ? pool : ITEMS.filter((it) => !opts.cat || it.cat.id === opts.cat);
  const out: Item[] = [];
  const used = new Set<number>();
  const catCount = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const prog = n > 1 ? i / (n - 1) : 0.5;
    const want = Math.min(2, Math.round(prog * 1.6 + level * 0.35 - 0.2));
    const prev = out[out.length - 1];
    const tricky = prev && prog >= 0.5 && rng() < 0.45 + level * 0.12;
    let best: Item | null = null;
    let bestScore = -1e9;
    for (let k = 0; k < 40; k++) {
      const it = src[Math.floor(rng() * src.length)];
      if (used.has(it.idx)) continue;
      let sc = -Math.abs(it.diff - want) * 3 + rng() * 2;
      if (!opts.cat) sc -= (catCount.get(it.cat.id) ?? 0) * 2.5;
      if (tricky && prev) {
        const hd = hueDist(it.hue, prev.hue);
        // mesmo tom, luminosidade/saturação diferentes = confunde a memória
        if (it.C > 12 && prev.C > 12) sc += hd < 25 ? 4 - hd / 10 : -2;
      } else if (prev && hueDist(it.hue, prev.hue) < 20 && prog < 0.5) sc -= 2;
      if (sc > bestScore) {
        bestScore = sc;
        best = it;
      }
    }
    if (!best) best = src.find((it) => !used.has(it.idx)) ?? src[0];
    used.add(best.idx);
    catCount.set(best.cat.id, (catCount.get(best.cat.id) ?? 0) + 1);
    out.push(best);
  }
  return out;
}
