/* ============================================================
 *  CAVA & FALA — entende o pedido falado/digitado.
 *  Normaliza (minúsculas, sem acento, sem pontuação), tira palavras
 *  de enchimento ("eu quero uma..."), acha a engenhoca pela frase
 *  mais parecida (distância de edição + sinônimos pt-BR/inglês),
 *  e o que sobrar vira modificador (grande, de ouro, duplo, rápido)
 *  ou módulo ("com rodas", "com hélice"...).
 * ============================================================ */
import { DOUBLE_WORDS, FAST_WORDS, GADGETS, MAT_WORDS, MODULES, SIZE_WORDS, noMods, type GDef, type ModuleId, type Mods, type SizeMod } from './gadgets';

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FILLER = new Set(
  'eu quero queria gostaria preciso precisa um uma uns umas o a os as me faz faca fazer cria criar crie construir constroi construa monta montar monte gera gerar da do das dos dai entao por favor pf pfv agora aqui ai la ali isso essa esse este esta novo nova i want need make build create give me please an the some new now ok hey bloop ei oi ola tipo assim que tem ter coloca colocar poe por'.split(
    ' ',
  ),
);
/** conectores que não contam na comparação */
const CONNECT = new Set(['de', 'com', 'with', 'of', 'e', 'and', 'em', 'no', 'na', 'd']);

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** semelhança 0..1 (com tolerância a plural) */
export function sim(a: string, b: string): number {
  if (a === b) return 1;
  const s = (x: string, y: string) => 1 - lev(x, y) / Math.max(x.length, y.length);
  let v = s(a, b);
  if (a.endsWith('s')) v = Math.max(v, s(a.slice(0, -1), b) * 0.99);
  if (a.endsWith('es')) v = Math.max(v, s(a.slice(0, -2), b) * 0.99);
  if (a.endsWith('oes')) v = Math.max(v, s(a.slice(0, -3) + 'ao', b) * 0.99);
  // palavras curtas pedem mais precisão
  if (Math.min(a.length, b.length) <= 3 && v < 1) v *= 0.85;
  return v;
}

interface Phrase {
  g: GDef;
  toks: string[];
  joined: string;
}
let phrases: Phrase[] | null = null;
function allPhrases(): Phrase[] {
  if (phrases) return phrases;
  phrases = [];
  for (const g of GADGETS)
    for (const w of [...g.words, norm(g.name())]) {
      const toks = norm(w)
        .split(' ')
        .filter((x) => x && !CONNECT.has(x));
      if (toks.length) phrases.push({ g, toks, joined: toks.join(' ') });
    }
  // frases mais longas primeiro (desempate)
  phrases.sort((a, b) => b.toks.length - a.toks.length);
  return phrases;
}

export interface Parsed {
  g: GDef | null;
  mods: Mods;
  score: number;
  /** palavras não entendidas */
  rest: string[];
  /** sugestões quando não achou */
  suggest: GDef[];
  heard: string;
}

const THRESH = 0.74;
/** engenhocas cujo nome também é um módulo */
const AS_MODULE: Record<string, ModuleId> = { foguete: 'foguete', mola: 'mola', bolhas: 'bolhas', ima: 'ima', neve: 'gelo', confete: 'confete' };

export function parse(text: string): Parsed {
  const heard = text;
  const toks = norm(text)
    .split(' ')
    .filter((x) => x && !FILLER.has(x));
  const mods = noMods();
  // índices das palavras "de conteúdo"
  const content = toks.map((w, i) => ({ w, i })).filter((x) => !CONNECT.has(x.w));
  let best: { g: GDef; score: number; used: Set<number>; len: number; pos: number } | null = null;
  for (const ph of allPhrases()) {
    const L = ph.toks.length;
    for (let s = 0; s + L <= content.length; s++) {
      const win = content.slice(s, s + L);
      const joined = win.map((x) => x.w).join(' ');
      let sc = sim(joined, ph.joined);
      if (L > 1) {
        // também compara palavra a palavra
        let per = 0;
        for (let k = 0; k < L; k++) per += sim(win[k].w, ph.toks[k]);
        sc = Math.max(sc, per / L);
      }
      // bônus leve para frases longas exatas; "com X" tende a ser módulo, não a engenhoca
      const pv = toks[win[0].i - 1];
      const adj = sc + (sc > 0.9 ? L * 0.02 : 0) - (pv === 'com' || pv === 'with' ? 0.06 : 0);
      const pos = win[0].i;
      if (sc >= THRESH && (!best || adj > best.score + 1e-6 || (Math.abs(adj - best.score) < 1e-6 && (L > best.len || (L === best.len && pos < best.pos)))))
        best = { g: ph.g, score: adj, used: new Set(win.map((x) => x.i)), len: L, pos };
    }
  }
  // "rocket cart": a engenhoca que também é módulo (foguete, mola, bolhas...) vira módulo da outra
  if (best && AS_MODULE[best.g.id]) {
    let alt: { g: GDef; used: Set<number>; sc: number } | null = null;
    for (const ph of allPhrases()) {
      if (ph.g === best.g || ph.toks.length !== 1) continue;
      for (const c of content) {
        if (best.used.has(c.i)) continue;
        const v = sim(c.w, ph.toks[0]);
        if (v >= 0.86 && (!alt || v > alt.sc)) alt = { g: ph.g, used: new Set([c.i]), sc: v };
      }
    }
    if (alt) best = { g: alt.g, score: alt.sc, used: alt.used, len: 1, pos: [...alt.used][0] };
  }
  const rest: string[] = [];
  const modules: ModuleId[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (best?.used.has(i)) continue;
    const w = toks[i];
    if (CONNECT.has(w)) continue;
    const score = (list: string[]) => list.reduce((m, x) => (x.includes(' ') ? m : Math.max(m, sim(w, x))), 0);
    const hit = (list: string[]) => score(list) >= 0.8;
    let used = false;
    for (const [k, list] of Object.entries(SIZE_WORDS))
      if (hit(list)) {
        mods.size = k as SizeMod;
        used = true;
        break;
      }
    if (used) continue;
    if (hit(DOUBLE_WORDS)) {
      mods.double = true;
      continue;
    }
    if (hit(FAST_WORDS)) {
      mods.fast = true;
      continue;
    }
    // "de ouro" → material; "com rodas" → módulo (o conector anterior decide se for ambíguo)
    const prev = toks[i - 1];
    let mat: [number, string[]] | undefined;
    let ms = 0;
    for (const e of MAT_WORDS) {
      const v = score(e[1]);
      if (v >= 0.8 && v > ms) (mat = e), (ms = v);
    }
    let mod: (typeof MODULES)[number] | undefined;
    let ds = 0;
    for (const md of MODULES) {
      if (md.id === best?.g.id) continue;
      const v = score(md.words);
      if (v >= 0.8 && v > ds) (mod = md), (ds = v);
    }
    if (mat && mod && Math.abs(ms - ds) > 0.05) {
      if (ms > ds) mod = undefined;
      else mat = undefined;
    }
    if (mat && (!mod || prev === 'de' || prev === 'of')) {
      mods.mat = mat[0];
      continue;
    }
    if (mod) {
      if (!modules.includes(mod.id) && modules.length < 3) modules.push(mod.id);
      continue;
    }
    if (mat) {
      mods.mat = mat[0];
      continue;
    }
    rest.push(w);
  }
  mods.modules = modules;
  let suggest: GDef[] = [];
  if (!best) {
    // sugestões: frases mais próximas de qualquer palavra
    const sc = new Map<GDef, number>();
    for (const ph of allPhrases())
      for (const c of content) {
        const v = sim(c.w, ph.toks[0]);
        if (v > (sc.get(ph.g) ?? 0)) sc.set(ph.g, v);
      }
    suggest = [...sc.entries()]
      .filter(([, v]) => v > 0.45)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
  }
  return { g: best?.g ?? null, mods, score: best ? Math.min(1, best.score) : 0, rest, suggest, heard };
}

/** escolhe a melhor entre várias transcrições (o reconhecedor devolve alternativas) */
export function parseBest(alts: string[]): Parsed {
  let best: Parsed | null = null;
  for (const a of alts) {
    if (!a) continue;
    const p = parse(a);
    const sc = p.score - p.rest.length * 0.02 + (p.g ? 1 : 0);
    const bs = best ? best.score - best.rest.length * 0.02 + (best.g ? 1 : 0) : -1;
    if (sc > bs) best = p;
  }
  return best ?? parse('');
}
