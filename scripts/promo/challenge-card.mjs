#!/usr/bin/env node
/**
 * Card de "Desafio" (1080x1920) com código promocional para redes sociais.
 *
 *   NODE_PATH=$(npm root -g) node scripts/promo/challenge-card.mjs --code BLOOP2026 --reward "500 moedas + skin" --out desafio.png
 *
 * Opções: --code  --reward  --goal "Faça mais de 100 pontos"  --until "30/11"  --skin campeao
 *         --where "Ajustes > Código"  --w 1080 --h 1920  --out arquivo.png
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { openPromo, renderTo } from './lib/render.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const a = process.argv.slice(2);
const opt = (k, d) => {
  const i = a.indexOf(`--${k}`);
  return i >= 0 && a[i + 1] !== undefined ? a[i + 1] : d;
};
const spec = {
  kind: 'challenge',
  w: Number(opt('w', 1080)),
  h: Number(opt('h', 1920)),
  code: String(opt('code', 'SEUCODIGO')).toUpperCase(),
  reward: opt('reward', '500 moedas'),
  goal: opt('goal', 'Faça mais de 100 pontos'),
  until: opt('until', ''),
  skin: opt('skin', 'campeao'),
  where: opt('where', 'Resgate dentro do jogo'),
};
const out = path.resolve(opt('out', `desafio-${spec.code}.png`));
const srv = await startServer(4342);
const browser = await chromium.launch();
try {
  const page = await openPromo(browser, srv.base);
  await renderTo(page, spec, out);
  console.log('ok', out);
} finally {
  await browser.close();
  await srv.close();
}
