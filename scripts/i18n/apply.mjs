#!/usr/bin/env node
/**
 * Mescla traduções nos dicionários src/i18n/locales/<lang>.ts.
 *
 *   node scripts/i18n/apply.mjs caminho/en.json caminho/de.lote2.json ...
 *
 * Cada arquivo é um JSON { "chave": "tradução" } ou um .tsv (chave<TAB>tradução por linha). O idioma vem do nome do arquivo
 * (tudo antes do primeiro ponto: en.json, de.lote2.json → en, de).
 * Chaves que não existem em scripts/i18n/pt.json são ignoradas (com aviso);
 * placeholders {x} diferentes do português são rejeitados.
 * Depois rode: node scripts/i18n/extract.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGS, readLocale, writeLocale, placeholders } from './extract.mjs';

const pt = JSON.parse(fs.readFileSync(new URL('./pt.json', import.meta.url), 'utf8'));
let bad = 0;
const byLang = {};
for (const f of process.argv.slice(2)) {
  const lang = path.basename(f).split('.')[0];
  if (!LANGS.includes(lang)) {
    console.error(`ignorado (idioma desconhecido): ${f}`);
    continue;
  }
  // .json → objeto; .tsv → "chave<TAB>tradução" por linha (\n literal vira quebra de linha)
  const raw = fs.readFileSync(f, 'utf8');
  const tr = f.endsWith('.tsv')
    ? Object.fromEntries(
        raw
          .split('\n')
          .filter((l) => l.includes('\t') && !l.startsWith('#'))
          .map((l) => {
            const i = l.indexOf('\t');
            return [l.slice(0, i).trim(), l.slice(i + 1).replace(/\\n/g, '\n').trimEnd()];
          }),
      )
    : JSON.parse(raw);
  const dict = (byLang[lang] ??= readLocale(lang));
  let n = 0;
  for (const [k, v] of Object.entries(tr)) {
    if (!(k in pt)) {
      console.warn(`  ${lang}: chave desconhecida ${k}`);
      continue;
    }
    if (typeof v !== 'string' || !v.trim()) {
      console.warn(`  ${lang}: vazio ${k}`);
      bad++;
      continue;
    }
    if (placeholders(v) !== placeholders(pt[k])) {
      console.warn(`  ${lang}: placeholders divergentes em ${k}: ${JSON.stringify(v)}`);
      bad++;
      continue;
    }
    dict[k] = v;
    n++;
  }
  console.log(`${f}: ${n} chaves → ${lang}`);
}
for (const [lang, dict] of Object.entries(byLang)) writeLocale(lang, dict);
if (bad) process.exit(1);
