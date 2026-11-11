// Prova que cada fase do Monta & Leva tem solução com as peças dadas (física real, planck.js, sem DOM).
// Uso: node scripts/dev/montaleva-verify.mjs   (sai com código 1 se alguma fase falhar)
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'mlv-'));
const out = join(dir, 'solutions.mjs');
await build({ entryPoints: [root + 'src/games/montaleva/solutions.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { verifyAll } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });
let bad = 0;
for (const r of verifyAll()) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} fase ${String(r.n).padStart(2)}  t=${r.time}s  peças=${r.parts}${r.flipped ? ' (tombou)' : ''}${r.valid ? '  inválida: ' + r.valid : ''}${r.reason ? '  motivo: ' + r.reason : ''}`);
}
console.log(bad ? `${bad} fase(s) falharam` : 'todas as 30 fases têm solução');
process.exit(bad ? 1 : 0);
