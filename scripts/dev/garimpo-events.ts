// Gerador de eventos do Garimpo: conta os eventos concretos distintos e mostra 30 de exemplo.
//   npx esbuild scripts/dev/garimpo-events.ts --bundle --platform=node --outfile=<tmp>.cjs && node <tmp>.cjs [lang]
import { setLang, registerLocale, type Lang } from '../../src/i18n';
import { enumerateEvents, TEMPLATES } from '../../src/games/garimpo/rp/events';

const lang = (process.argv[2] ?? 'pt') as Lang;
async function main(): Promise<void> {
  if (lang !== 'pt') {
    const m = await import(`../../src/i18n/locales/${lang}.ts`);
    registerLocale(lang, m.default);
    setLang(lang);
  }
  const all = enumerateEvents();
  const keys = new Set(all.map((e) => e.key));
  const cards = new Set(all.map((e) => `${e.title}|${e.text}|${e.chips}|${e.choices}`));
  const byCat: Record<string, number> = {};
  for (const e of all) {
    const id = e.key.split('|')[0];
    const cat = TEMPLATES.find((t) => t.id === id)!.cat;
    byCat[cat] = (byCat[cat] ?? 0) + 1;
  }
  console.log(`modelos: ${TEMPLATES.length}`);
  console.log(`eventos concretos (chaves distintas): ${keys.size}`);
  console.log(`cartões distintos (texto + contexto + escolhas/valores): ${cards.size}`);
  console.log('por categoria:', byCat);
  // amostra espalhada (determinística)
  const step = Math.floor(all.length / 30);
  for (let i = 0; i < 30; i++) {
    const e = all[(i * step + 7) % all.length];
    console.log(`${String(i + 1).padStart(2)}. [${e.chips}] ${e.title} — ${e.text}  ⇒  ${e.choices}`);
  }
  if (keys.size < 1000) {
    console.error('MENOS DE 1000 EVENTOS!');
    process.exit(1);
  }
}
void main();
