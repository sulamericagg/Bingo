// Checa o catálogo de bichinhos: 300 entradas, enums válidos, nomes e assinaturas únicos.
// Uso: node scripts/dev/check-creatures.mjs
import { build } from 'esbuild';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = root + 'node_modules/.cache-check-creatures.mjs';
await build({ entryPoints: [root + 'src/creatures/catalog.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const m = await import(out + '?t=' + Date.now());
unlinkSync(out);
const src = readFileSync(root + 'src/creatures/catalog.ts', 'utf8');
const enumOf = (name) => {
  const mm = src.match(new RegExp(`export type ${name} =([^;]+);`));
  return new Set([...mm[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]));
};
const E = { arch: enumOf('Archetype'), top: enumOf('TopPart'), eyes: enumOf('EyeStyle'), mouth: enumOf('MouthStyle'), pattern: enumOf('Pattern'), limbs: enumOf('Limbs'), props: enumOf('Prop') };
let errors = 0;
const err = (s) => { errors++; console.log('ERRO', s); };
if (m.CREATURES.length !== 300) err(`total ${m.CREATURES.length} != 300`);
const names = new Map(), sigs = new Map(), ids = new Set(), looks = new Map();
for (const c of m.CREATURES) {
  if (ids.has(c.id)) err('id duplicado ' + c.id); ids.add(c.id);
  const k = c.name.toLowerCase();
  if (names.has(k)) err(`nome duplicado "${c.name}" (${names.get(k)} / ${c.id})`); names.set(k, c.id);
  const s = m.creatureSignature(c);
  if (sigs.has(s)) err(`assinatura duplicada ${c.id} = ${sigs.get(s)}`); sigs.set(s, c.id);
  const d = c.design;
  for (const f of ['arch', 'top', 'eyes', 'mouth', 'pattern', 'limbs']) if (!E[f].has(d[f])) err(`${c.id} ${f} inválido: ${d[f]}`);
  for (const p of d.props) if (!E.props.has(p)) err(`${c.id} prop inválido: ${p}`);
  if (!/^#[0-9a-f]{6}$/i.test(d.col)) err(`${c.id} cor inválida ${d.col}`);
  if (!c.desc || c.desc.length < 12) err(`${c.id} descrição curta`);
  // "parecidos demais": mesmo arquétipo+topo+membros+adereços
  const look = [d.arch, d.top, d.limbs, d.props.join('+')].join('|');
  if (looks.has(look)) console.log(`aviso: silhueta parecida ${c.id} ~ ${looks.get(look)} (${look})`);
  else looks.set(look, c.id);
}
// uso das peças
for (const f of Object.keys(E)) {
  const used = new Set(m.CREATURES.flatMap((c) => (f === 'props' ? c.design.props : [c.design[f]])));
  const unused = [...E[f]].filter((x) => !used.has(x) && x !== 'none');
  if (unused.length) console.log(`info: ${f} sem uso: ${unused.join(', ')}`);
}
console.log(errors ? `${errors} erro(s)` : `OK: 300 bichinhos, ${names.size} nomes e ${sigs.size} assinaturas únicas`);
process.exit(errors ? 1 : 0);
