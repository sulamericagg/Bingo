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
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
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

/**
 * "Como soa" em pt-BR (o reconhecedor erra a grafia, não o som): ç/c/s/ss/z, ch/x, lh/li, nh/ni,
 * qu/k, ão/am/ã, e/i e o/u finais, h mudo, letras dobradas, l final = u.
 */
export function phon(w: string): string {
  return w
    .replace(/^h/, '')
    .replace(/ph/g, 'f')
    .replace(/(ch|sh)/g, 'x')
    .replace(/lh/g, 'li')
    .replace(/nh/g, 'ni')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/qu/g, 'kw')
    .replace(/sc([ei])/g, 's$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/g([ei])/g, 'j$1')
    .replace(/z/g, 's')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/(am|an|ao)$/, 'ao')
    .replace(/em$/, 'ei')
    .replace(/l$/, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/e$/, 'i')
    .replace(/o$/, 'u')
    .replace(/h/g, '');
}

/** variantes de uma palavra falada: plural, diminutivo (-inho/-zinho), feminino/masculino */
export function variants(a: string): string[] {
  const out = [a];
  const add = (x: string) => x.length >= 2 && !out.includes(x) && out.push(x);
  if (a.endsWith('oes') || a.endsWith('aes')) add(a.slice(0, -3) + 'ao');
  if (a.endsWith('ns')) add(a.slice(0, -2) + 'm');
  if (a.endsWith('es')) add(a.slice(0, -2));
  if (a.endsWith('s')) add(a.slice(0, -1));
  for (const x of [...out]) {
    const z = /^(.+?)zinh[oa]s?$/.exec(x);
    if (z) add(z[1]);
    const i = /^(.+?)inh([oa])s?$/.exec(x);
    if (i) add(i[1] + i[2]);
  }
  for (const x of [...out]) {
    if (x.endsWith('a')) add(x.slice(0, -1) + 'o');
    else if (x.endsWith('o')) add(x.slice(0, -1) + 'a');
  }
  return out;
}

const simCache = new Map<string, number>();
/** semelhança 0..1 (tolera plural, diminutivo, gênero e erros "de som") */
export function sim(a: string, b: string): number {
  if (a === b) return 1;
  const key = a + '|' + b;
  const c = simCache.get(key);
  if (c !== undefined) return c;
  const s = (x: string, y: string) => 1 - lev(x, y) / Math.max(x.length, y.length);
  let v = 0;
  const pb = phon(b);
  for (const va of variants(a)) {
    const k = va === a ? 1 : 0.985;
    v = Math.max(v, s(va, b) * k);
    if (va.length >= 3) v = Math.max(v, s(phon(va), pb) * 0.97 * k);
  }
  // palavras curtas pedem mais precisão
  if (Math.min(a.length, b.length) <= 3 && v < 1) v *= 0.85;
  if (simCache.size > 20000) simCache.clear();
  simCache.set(key, v);
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
  /** certeza alta: cria direto (senão o jogo pergunta "você quis dizer?") */
  sure: boolean;
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
      // o reconhecedor às vezes quebra a palavra ("trampo lim"): tenta grudar com a próxima
      if (L === 1 && s + 1 < content.length) {
        const two = sim(win[0].w + content[s + 1].w, ph.joined.replace(/ /g, ''));
        if (two > sc + 0.05 && two >= THRESH) {
          sc = two - 0.01;
          win.push(content[s + 1]);
        }
      }
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
  // sugestões (sempre): frases mais próximas de qualquer palavra — para o "você quis dizer?"
  const sc = new Map<GDef, number>();
  for (const ph of allPhrases())
    for (const c of content) {
      if (ph.g === best?.g) continue;
      const v = Math.max(sim(c.w, ph.toks[0]), ph.toks.length > 1 ? sim(c.w, ph.toks.join('')) : 0);
      if (v > (sc.get(ph.g) ?? 0)) sc.set(ph.g, v);
    }
  const suggest = [...sc.entries()]
    .filter(([, v]) => v > 0.45)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);
  const score = best ? Math.min(1, best.score) : 0;
  // certeza: bem parecido, e as mesmas palavras não lembram outra engenhoca
  let rival = 0;
  if (best) {
    const usedJ = [...best.used]
      .sort((a, b) => a - b)
      .map((i) => toks[i])
      .join(' ');
    for (const ph of allPhrases()) if (ph.g !== best.g) rival = Math.max(rival, sim(usedJ, ph.joined));
  }
  const sure = !!best && score >= 0.84 && rival < score - 0.04;
  return { g: best?.g ?? null, mods, score, rest, suggest, heard, sure };
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
