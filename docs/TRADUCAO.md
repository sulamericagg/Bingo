# Tradução (i18n) — como funciona e como atualizar

12 idiomas: **pt** (fonte), en, es, de, fr, it, ja, ko, ru, tr, id, zh (chinês simplificado).

## Como o código usa

- No TS: `t('chave.unica', 'Texto em português', { n: 3 })` — o português é o fallback e a fonte da verdade.
  Placeholders `{x}` são substituídos por `vars`. Números: `fmt(n)`.
- No HTML estático (`index.html` e templates dentro dos .ts): `data-i18n="chave"` (texto),
  `data-i18n-aria` (aria-label), `data-i18n-ph` (placeholder), com o português escrito no próprio HTML.
  **Não** coloque `data-i18n` num elemento cujo conteúdo o JS reescreve (ex.: `#over-title`); envolva só o texto num `<span data-i18n>`.
- Dados com nome exibido (skins, rastros, bichinhos, temporadas) ficam em pt-BR nos dados e são traduzidos **na exibição**:
  `skinName(s)`, `skinDesc(s)`, `trailName(t)`, `cosmeticName(item, isSkin)` (src/game/skins.ts),
  `seasonTheme(s)` (src/creatures/seasons.ts), `t(\`creature.${id}\`, name)`. IDs nunca são traduzidos.
- Textos de objetos de configuração que aparecem na UI usam *getters* (`get label() { return t(...) }`)
  para que a troca de idioma em tempo real funcione (bus `'lang'` re-renderiza).
- Dicionários: `src/i18n/locales/<lang>.ts` (`export default { ... }`), carregados sob demanda.
- Fontes: Fredoka só cobre latim. CSS usa `var(--font)` (definida em `src/ui/styles.css` por `:lang(ja|ko|zh|ru)`);
  canvas usa `gameFont(peso, px)` de `src/i18n/font.ts`. Nunca escreva `'700 20px Fredoka'` direto no canvas.

## Fluxo de atualização (re-executável)

```bash
# 1) extrair: gera scripts/i18n/pt.json (fonte), scripts/i18n/missing/<lang>.json e scripts/i18n/report.txt
node scripts/i18n/extract.mjs

# 2) traduzir o que falta: para cada idioma, abra scripts/i18n/missing/<lang>.json
#    (chave → português) e escreva um arquivo de tradução, JSON ou TSV:
#       <lang>.lote.tsv   →   chave<TAB>tradução   (uma por linha)
#       <lang>.lote.json  →   { "chave": "tradução" }
#    O idioma é o prefixo do nome do arquivo (en.disaster.tsv → en).

# 3) mesclar nos dicionários (valida placeholders e vazios; chaves desconhecidas são ignoradas)
node scripts/i18n/apply.mjs caminho/en.disaster.tsv caminho/de.disaster.tsv ...

# 4) validar: sai com código 1 se faltar chave obrigatória, houver texto vazio ou placeholder diferente
node scripts/i18n/extract.mjs --check
npx tsc --noEmit && npx vite build
```

Depois de mesclar o minigame de desastres (`src/games/disaster/*`): rode o passo 1; as chaves novas
aparecem em `scripts/i18n/missing/<lang>.json`; traduza-as (passo 2, pode ser feito por um agente com a
mesma instrução de tom abaixo) e rode os passos 3–4.

O relatório (`scripts/i18n/report.txt`) lista:
- **conflitos** — mesma chave usada com textos pt diferentes (corrija para ficar uma chave por texto);
- **chamadas dinâmicas** — `t()` com chave ou texto não literal (precisam de entrada em `scanDynamicData()` do extract.mjs se o texto vier de dados);
- por idioma: faltando obrigatórias / faltando opcionais (bichinhos) / órfãs / problemas.

Chaves `creature.*` (300 nomes + 300 descrições dos bichinhos) são **opcionais**: sem tradução, aparece o português.

## Tom das traduções

Jogo para todas as idades: curto, brincalhão, natural para cada mercado (não literal). Botões curtos
(alemão e russo tendem a estourar — abrevie). Mantenha `{x}` exatamente iguais e as marcas: Bloop World,
Bloop Orbit, TEAM Ross; "Clube Bloop" → "Bloop Club"/"Club Bloop"/"ブループクラブ" etc. Nomes com trocadilho
(skins, carros, comidas) podem ser localizados, mas devem continuar únicos.

## Loja (Play Store)

Fichas em `store/listings/<lang>.md` (título ≤30, curta ≤80, completa ≤4000 caracteres).
