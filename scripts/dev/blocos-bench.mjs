// node scripts/dev/blocos-bench.mjs  → empacota blocos-bench.ts com esbuild e roda em Node
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'blocos-'));
const outfile = join(dir, 'bench.mjs');
await build({ entryPoints: [new URL('./blocos-bench.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' });
await import(pathToFileURL(outfile).href);
