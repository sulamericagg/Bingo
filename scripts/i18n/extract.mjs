#!/usr/bin/env node
/**
 * Extração de textos traduzíveis (re-executável).
 *
 *   node scripts/i18n/extract.mjs           → escreve scripts/i18n/pt.json + scripts/i18n/missing/<lang>.json e mostra relatório
 *   node scripts/i18n/extract.mjs --check   → igual, mas sai com código 1 se faltar chave / placeholder divergente / texto vazio
 *
 * Fontes:
 *   - chamadas t('chave', 'Português', vars) em src/**\/*.ts (aspas simples, duplas ou crase; aspas escapadas;
 *     chamadas multi-linha; concatenação 'a' + 'b'). Chave com ${...} é dinâmica → listada à parte.
 *   - atributos data-i18n / data-i18n-aria / data-i18n-ph em index.html e em templates HTML dentro dos .ts.
 *   - dados com texto exibido via chave dinâmica (ver DYNAMIC abaixo): bichinhos, temporadas.
 *
 * Saídas:
 *   scripts/i18n/pt.json             fonte da verdade (chave → português), ordenada
 *   scripts/i18n/missing/<lang>.json chaves sem tradução no idioma (chave → português) — é isso que se traduz
 *   scripts/i18n/report.txt          conflitos (mesma chave com textos diferentes), chaves dinâmicas, órfãs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'scripts/i18n');
const LOCALES_DIR = path.join(ROOT, 'src/i18n/locales');
export const LANGS = ['en', 'es', 'de', 'fr', 'it', 'ja', 'ko', 'ru', 'tr', 'id', 'zh'];
const CHECK = process.argv.includes('--check');
/**
 * Chaves de dados que NÃO entram na verificação obrigatória (traduzidas opcionalmente; sem tradução aparece o pt):
 *   creature.*            nomes/descrições dos 300 bichinhos
 *   song.<id>, .band      títulos e bandas das músicas (nomes próprios fictícios)
 * Estilos/palcos (song.style.*, song.stage.*) e todo o resto são obrigatórios.
 */
const isOptional = (k) => k.startsWith('creature.') || (k.startsWith('song.') && !/^song\.(style|stage)\./.test(k));

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p === LOCALES_DIR) continue;
      walk(p, acc);
    } else if (/\.ts$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

const lineOf = (src, i) => src.slice(0, i).split('\n').length;

/** Lê um literal de string JS a partir de src[i] (que deve ser ' " ou `). Retorna {value, end, dynamic}. */
function readString(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let v = '';
  let dynamic = false;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      const n = src[j + 1];
      const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '`': '`', $: '$' };
      if (n === 'u') {
        if (src[j + 2] === '{') {
          const k = src.indexOf('}', j);
          v += String.fromCodePoint(parseInt(src.slice(j + 3, k), 16));
          j = k + 1;
        } else {
          v += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16));
          j += 6;
        }
        continue;
      }
      if (n === '\n') {
        j += 2;
        continue;
      }
      v += map[n] ?? n;
      j += 2;
      continue;
    }
    if (c === q) return { value: v, end: j + 1, dynamic };
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      dynamic = true;
      let depth = 0;
      let k = j + 1;
      for (; k < src.length; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) break;
      }
      v += src.slice(j, k + 1);
      j = k + 1;
      continue;
    }
    v += c;
    j++;
  }
  return null;
}

const skipWs = (src, i) => {
  for (;;) {
    while (/\s/.test(src[i] ?? '')) i++;
    if (src.startsWith('//', i)) i = src.indexOf('\n', i) + 1 || src.length;
    else if (src.startsWith('/*', i)) i = src.indexOf('*/', i) + 2;
    else return i;
  }
};

/** string literal possivelmente concatenada: 'a' + 'b' */
function readConcat(src, i) {
  const first = readString(src, i);
  if (!first) return null;
  let { value, end, dynamic } = first;
  for (;;) {
    const k = skipWs(src, end);
    if (src[k] !== '+') break;
    const k2 = skipWs(src, k + 1);
    const nx = readString(src, k2);
    if (!nx) return { value, end, dynamic, partial: true };
    value += nx.value;
    dynamic ||= nx.dynamic;
    end = nx.end;
  }
  return { value, end, dynamic };
}

const entries = new Map(); // key -> [{text, where}]
const dynamicCalls = [];
const add = (key, text, where) => {
  if (!entries.has(key)) entries.set(key, []);
  entries.get(key).push({ text, where });
};

function stripComments(src) {
  // remove apenas comentários de linha/bloco fora de strings, preservando posições (troca por espaços)
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const s = readString(src, i);
      const end = s ? s.end : i + 1;
      out += src.slice(i, end);
      i = end;
    } else if (src.startsWith('//', i) && src[i - 1] !== ':' ) {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? src.length : e;
      out += ' '.repeat(end - i);
      i = end;
    } else if (src.startsWith('/*', i)) {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? src.length : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else if (c === '/' && /[(,=:[!&|?{};]\s*$/.test(out.slice(-20)) && src[i + 1] !== '/' && src[i + 1] !== '*') {
      // literal de regex: copia até a barra final (sem interpretar aspas)
      let j = i + 1;
      let cls = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else {
          if (src[j] === '[') cls = true;
          else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) break;
          j++;
        }
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function scanTs(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  const rel = path.relative(ROOT, file);
  const re = /(?<![\w$.])t\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = skipWs(src, m.index + 2);
    const k = readConcat(src, i);
    if (!k) continue; // t(variavel, ...) — infra (langs.ts) ou dinâmica
    i = skipWs(src, k.end);
    if (src[i] !== ',') continue;
    i = skipWs(src, i + 1);
    const f = readConcat(src, i);
    const where = `${rel}:${lineOf(src, m.index)}`;
    if (k.dynamic || !f || f.dynamic || f.partial) {
      dynamicCalls.push({ key: k.value, fallback: f ? f.value : src.slice(i, i + 40).split(/[,)\n]/)[0], where });
      continue;
    }
    add(k.value, f.value, where);
  }
  scanHtml(src, rel);
}

const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');

function scanHtml(src, rel) {
  const tagRe = /<([a-zA-Z][\w-]*)(\s[^<>]*?\bdata-i18n(?:-aria|-ph)?="[^"]*"[^<>]*)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const [, tag, attrs] = m;
    const where = `${rel}:${lineOf(src, m.index)}`;
    const attr = (n) => {
      const a = new RegExp(`(?:^|\\s)${n}="([^"]*)"`).exec(attrs);
      return a ? decodeEntities(a[1]) : null;
    };
    const k = attr('data-i18n');
    if (k && !k.includes('${')) {
      const close = src.indexOf(`</${tag}`, m.index + m[0].length);
      const inner = src.slice(m.index + m[0].length, close);
      add(k, decodeEntities(inner.replace(/<[^>]*>/g, '')), where);
    }
    const ka = attr('data-i18n-aria');
    const va = attr('aria-label');
    if (ka && va != null && !ka.includes('${')) add(ka, va, where);
    const kp = attr('data-i18n-ph');
    const vp = attr('placeholder');
    if (kp && vp != null && !kp.includes('${')) add(kp, vp, where);
  }
}

/* ---------- dados exibidos com chave dinâmica ---------- */
async function scanDynamicData() {
  const out = {};
  // bichinhos: t(`creature.${id}`, name) / t(`creature.${id}.desc`, desc) — tabela em src/creatures/catalog.ts
  const RAR = ['common', 'medio', 'rare', 'epic', 'legendary'];
  const cat = fs.readFileSync(path.join(ROOT, 'src/creatures/catalog.ts'), 'utf8');
  const table = cat.slice(cat.indexOf('const TABLE'), cat.indexOf('];', cat.indexOf('const TABLE')));
  let i = 0;
  for (const m of table.matchAll(/^\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) {
    const cols = m[1].replace(/\\'/g, "'").split('|');
    const id = `s${String(Math.floor(i / 5)).padStart(2, '0')}-${RAR[i % 5]}`;
    out[`creature.${id}`] = cols[0];
    out[`creature.${id}.desc`] = cols[9];
    i++;
  }
  // temporadas: t(`season.${id}.theme`, theme) — src/creatures/seasons.ts
  const sea = fs.readFileSync(path.join(ROOT, 'src/creatures/seasons.ts'), 'utf8');
  let j = 0;
  for (const m of sea.matchAll(/^\s*\['([^']+)', \['#/gm)) out[`season.s${String(j++).padStart(2, '0')}.theme`] = m[1];
  // skins e rastros: skinName()/skinDesc()/trailName()/trailDesc() — src/game/skins.ts
  const sk = fs.readFileSync(path.join(ROOT, 'src/game/skins.ts'), 'utf8');
  const trailsAt = sk.indexOf('export const TRAILS');
  for (const m of sk.matchAll(/^\s*\{ id: '([^']+)', name: '((?:[^'\\]|\\.)*)'.*?(?:desc: '((?:[^'\\]|\\.)*)')?[^']*\},?\s*$/gm)) {
    const kind = m.index > trailsAt ? 'trail' : 'skin';
    const un = (x) => x.replace(/\\'/g, "'");
    out[`${kind}.${m[1]}`] = un(m[2]);
    if (m[3]) out[`${kind}.${m[1]}.desc`] = un(m[3]);
  }
  Object.assign(out, await scanBundledData());
  return out;
}

/**
 * Tabelas geradas/compostas em TS (músicas, passes, peças do criador, cosméticos da banda): em vez de
 * replicar a lógica com regex, empacota os módulos de dados com esbuild e lê os valores reais.
 */
async function scanBundledData() {
  const out = {};
  const esbuild = await import('esbuild');
  const r = await esbuild.build({
    stdin: {
      contents: `
        export { PARTS, PALETTES } from './src/game/avatar';
        export { MOTIFS, motifSlug } from './src/pass/catalog';
        export { CATALOG } from './src/music/songs/catalog';
        export { STYLES, STAGES } from './src/music/songs/styles';
        export { SEASON_MUSIC } from './src/music/season-music-data';
        export { AURA_FAMILY_NAME } from './src/pass/music/auras';
        export { MOVE_NAME } from './src/pass/music/dances';
        export { COSMETICS } from './src/games/band/cosmetics';`,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'error',
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty', '.mp3': 'empty', '.ogg': 'empty', '.webp': 'empty' },
  });
  // stubs mínimos de navegador (os módulos só montam tabelas; nada é desenhado)
  const g = globalThis;
  const any = () => new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '' : any()), apply: () => any(), construct: () => any() });
  g.window ??= g;
  g.document ??= any();
  g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  g.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  g.addEventListener ??= () => {};
  g.requestAnimationFrame ??= () => 0;
  const m = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
  // peças do criador de personagem
  for (const p of [...m.PARTS, ...m.PALETTES]) out[`part.${p.id}`] = p.name;
  // motivos dos passes (compõem nomes: "Olhos de {m}", "Tapete de {m}"...)
  for (const row of m.MOTIFS) for (const w of row) out[`pass.motif.${m.motifSlug(w)}`] = w;
  // músicas: títulos/bandas (opcionais), estilos e palcos
  for (const e of m.CATALOG) {
    out[`song.${e.spec.id}`] = e.title;
    out[`song.${e.spec.id}.band`] = e.band;
  }
  for (const [id, st] of Object.entries(m.STYLES)) out[`song.style.${id}`] = st.name;
  for (const [id, st] of Object.entries(m.STAGES)) out[`song.stage.${id}`] = st.name;
  // Passe Musical: temas, famílias de aura, passos de dança, instrumentos, itens iniciais
  m.SEASON_MUSIC.forEach((row, i) => (out[`mtheme.s${String(i).padStart(2, '0')}`] = row.split('|')[0]));
  for (const [k, v] of Object.entries(m.AURA_FAMILY_NAME)) out[`mpass.fam.${k}`] = v;
  for (const [k, v] of Object.entries(m.MOVE_NAME)) out[`mpass.move.${k}`] = v;
  const mi = fs.readFileSync(path.join(ROOT, 'src/pass/music/index.ts'), 'utf8');
  const inst = /const INST_NAME[^=]*=\s*\{([^}]*)\}/.exec(mi);
  for (const x of inst[1].matchAll(/(\w+): '([^']*)'/g)) out[`mpass.inst.${x[1]}`] = x[2];
  for (const x of mi.matchAll(/\{ id: '(mp[ad]_free_\d+)', name: '([^']*)'/g)) out[`mpass.${x[1]}`] = x[2];
  for (const x of mi.matchAll(/kind: '(gems|coins|tickets)', id: '', amount: [^,]+, name: '([^']*)'/g)) out[`mpass.kind.${x[1]}`] = x[2];
  // cosméticos do Bloop Banda
  for (const c of m.COSMETICS) out[`band.cos.${c.kind}.${c.id}`] = c.name;
  return out;
}

/* ---------- locales ---------- */
export function readLocale(lang) {
  const f = path.join(LOCALES_DIR, `${lang}.ts`);
  if (!fs.existsSync(f)) return {};
  const src = fs.readFileSync(f, 'utf8');
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  try {
    return JSON.parse(body);
  } catch {
    return new Function(`return (${body})`)();
  }
}

export function writeLocale(lang, dict) {
  const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]));
  const body = JSON.stringify(sorted, null, 2);
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(LOCALES_DIR, `${lang}.ts`),
    `// Gerado/mesclado por scripts/i18n/apply.mjs — edite à vontade, mas mantenha JSON válido entre as chaves.\nexport default ${body} as Record<string, string>;\n`,
  );
}

export const placeholders = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');

async function main() {
  for (const f of walk(path.join(ROOT, 'src'))) scanTs(f);
  scanHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'index.html');

  const pt = {};
  const conflicts = [];
  for (const [k, list] of entries) {
    const texts = [...new Set(list.map((e) => e.text))];
    pt[k] = list[0].text;
    if (texts.length > 1) conflicts.push({ key: k, uses: list });
  }
  const staticCount = Object.keys(pt).length;
  const data = await scanDynamicData();
  let dataCount = 0;
  for (const [k, v] of Object.entries(data)) if (!(k in pt)) (pt[k] = v), dataCount++;

  const sorted = Object.fromEntries(Object.keys(pt).sort().map((k) => [k, pt[k]]));
  fs.writeFileSync(path.join(OUT, 'pt.json'), JSON.stringify(sorted, null, 2) + '\n');

  const lines = [];
  lines.push(`Chaves: ${Object.keys(pt).length} (${staticCount} de t()/HTML + ${dataCount} de dados: bichinhos/temporadas/skins/rastros/músicas/passes/peças)`);
  lines.push(`\n== Conflitos (mesma chave, textos diferentes): ${conflicts.length}`);
  for (const c of conflicts) {
    lines.push(`  ${c.key}`);
    for (const u of c.uses) lines.push(`     ${u.where}  ${JSON.stringify(u.text)}`);
  }
  const unknownDyn = dynamicCalls.filter((d) => !/^`?(creature|season|skin|trail|song|mpass|mtheme|band\.cos|part|pass\.motif)\./.test(d.key));
  lines.push(`\n== Chamadas dinâmicas (chave ou texto não-literal): ${dynamicCalls.length}`);
  for (const d of dynamicCalls) lines.push(`  ${d.where}  t(${JSON.stringify(d.key)}, ${d.fallback.trim()})`);

  let fail = conflicts.length > 0 ? 0 : 0;
  const emptyPt = Object.entries(pt).filter(([, v]) => !v.trim());
  if (emptyPt.length) lines.push(`\n== Textos pt vazios: ${emptyPt.map(([k]) => k).join(', ')}`);

  fs.mkdirSync(path.join(OUT, 'missing'), { recursive: true });
  lines.push('\n== Por idioma (faltando obrigatórias / faltando dados opcionais / órfãs / problemas)');
  for (const lang of LANGS) {
    const loc = readLocale(lang);
    const missing = {};
    let missReq = 0;
    let missOpt = 0;
    for (const k of Object.keys(sorted)) {
      if (loc[k] == null || loc[k] === '') {
        missing[k] = sorted[k];
        if (isOptional(k)) missOpt++;
        else missReq++;
      }
    }
    const orphans = Object.keys(loc).filter((k) => !(k in pt));
    const problems = [];
    for (const [k, v] of Object.entries(loc)) {
      if (!(k in pt)) continue;
      if (typeof v !== 'string' || !v.trim()) problems.push(`${k}: vazio`);
      else if (placeholders(v) !== placeholders(pt[k]))
        problems.push(`${k}: placeholders ${placeholders(v) || '-'} ≠ pt ${placeholders(pt[k]) || '-'}`);
    }
    fs.writeFileSync(path.join(OUT, 'missing', `${lang}.json`), JSON.stringify(missing, null, 2) + '\n');
    lines.push(`  ${lang}: ${missReq} / ${missOpt} / ${orphans.length} / ${problems.length}`);
    for (const p of problems) lines.push(`      ! ${p}`);
    if (orphans.length) lines.push(`      órfãs: ${orphans.slice(0, 30).join(', ')}${orphans.length > 30 ? ' …' : ''}`);
    if (missReq || problems.length) fail = 1;
  }
  const report = lines.join('\n');
  fs.writeFileSync(path.join(OUT, 'report.txt'), report + '\n');
  // no terminal: resumo sem a lista longa de chamadas dinâmicas
  console.log(
    report
      .split('\n')
      .filter((l, i, a) => {
        const s = a.findIndex((x) => x.startsWith('\n== Chamadas') || x.startsWith('== Chamadas'));
        const e = a.findIndex((x, j) => j > s && x.includes('== ') && !x.includes('Chamadas'));
        return !(s >= 0 && i > s && i < (e < 0 ? a.length : e));
      })
      .join('\n'),
  );
  console.log(`\n(${unknownDyn.length} chamadas dinâmicas fora de creature/season — ver scripts/i18n/report.txt)`);
  if (CHECK && fail) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
