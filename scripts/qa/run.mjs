// Suíte de QA do Bloop World.  npm run qa  [-- partes]
//   partes: hub, small, games, leaks, online, perf   (padrão: hub small games leaks online)
//   QA_NOBUILD=1  pula o `vite build`;  QA_URL=http://...  usa um servidor já aberto
// Capturas e relatórios JSON: shots-qa/   (fora do git)
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, SHOTS } from './lib.mjs';

const parts = process.argv.slice(2).length ? process.argv.slice(2) : ['hub', 'small', 'games', 'leaks', 'online'];
const URL = process.env.QA_URL || 'http://127.0.0.1:5310/';
let preview = null;

async function up() { try { return (await fetch(URL)).ok; } catch { return false; } }

const steps = {
  hub: ['hub.mjs', 'pixel'],
  small: ['hub.mjs', 'small'],
  en: ['hub.mjs', 'small', 'en'],
  games: ['games.mjs'],
  leaks: ['leaks.mjs', '10'],
  online: ['online.mjs'],
  perf: ['perf.mjs'],
};

(async () => {
  const needWeb = parts.some((p) => p !== 'online');
  if (needWeb && !(await up())) {
    if (!process.env.QA_NOBUILD) {
      console.log('» vite build');
      const b = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
      if (b.status) process.exit(b.status);
    }
    console.log('» vite preview :5310');
    preview = spawn('npx', ['vite', 'preview', '--port', '5310', '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
    for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  } else if (parts.includes('online') && !process.env.QA_NOBUILD && !needWeb) {
    spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  const summary = [];
  for (const p of parts) {
    const s = steps[p];
    if (!s) { console.log('parte desconhecida', p); continue; }
    console.log(`\n======== ${p} ========`);
    const r = spawnSync('node', [join(ROOT, 'scripts', 'qa', s[0]), ...s.slice(1)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, QA_URL: URL } });
    summary.push(`${r.status === 0 ? 'OK   ' : 'FALHA'} ${p}`);
  }
  if (preview) try { process.kill(-preview.pid); } catch { /* ok */ }
  console.log('\n======== RESUMO ========\n' + summary.join('\n') + `\ncapturas e JSON: ${SHOTS}`);
  process.exitCode = summary.some((l) => l.startsWith('FALHA')) ? 1 : 0;
})();
