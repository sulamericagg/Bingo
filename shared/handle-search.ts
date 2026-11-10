/**
 * Busca de @nomes — normalização compartilhada (servidor indexa, app normaliza o que a pessoa digita).
 *
 *  searchNorm("  @Ána Star ") → "ana_star"   (sem acento, minúsculo, espaço vira _, só a-z 0-9 _ .)
 *  skeleton("ana_star.10")    → "anastar10"  (sem separadores: acha "anastar" digitado junto)
 *  tokens("ana_star10")       → ["ana", "star", "10"] (acha "star" no meio do nome)
 *  editDistance / prefixDistance: tolerância a erro de digitação (Damerau-Levenshtein).
 */

export function searchNorm(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 16);
}

export const skeleton = (h: string): string => h.replace(/[_.]/g, '');

export function tokens(h: string): string[] {
  return [...new Set(h.match(/[a-z]+|[0-9]+/g) ?? [])].filter((x) => x.length >= 2);
}

/** Distância de edição (inserção, remoção, troca e transposição de vizinhos). */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Quão longe `q` está do COMEÇO de `h` (para "como você digita"): min sobre prefixos de tamanho ±1. */
export function prefixDistance(q: string, h: string, max = 2): number {
  let best = max + 1;
  for (let k = Math.max(1, q.length - 1); k <= Math.min(h.length, q.length + 1); k++) best = Math.min(best, editDistance(q, h.slice(0, k), max));
  return best;
}

/** Tolerância a erro conforme o tamanho do que foi digitado. */
export const fuzzyBudget = (len: number): number => (len < 3 ? 0 : len < 6 ? 1 : 2);
