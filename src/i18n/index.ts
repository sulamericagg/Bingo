/**
 * Tradução. Use SEMPRE: t('chave.unica', 'Texto em português')
 * O português é o texto padrão (fallback); o agente de tradução gera os outros idiomas
 * em src/i18n/locales/<lang>.ts a partir de todas as chamadas t().
 * Interpolação: t('run.score', 'Você fez {n} pontos', { n: 10 })
 */
export type Lang = 'pt' | 'en' | 'es' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ru' | 'tr' | 'id' | 'zh';

type Dict = Record<string, string>;
const dicts: Partial<Record<Lang, Dict>> = {};
let current: Lang = 'pt';

export function registerLocale(lang: Lang, dict: Dict): void {
  dicts[lang] = { ...(dicts[lang] ?? {}), ...dict };
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem('bo-lang', lang);
  } catch {
    /* */
  }
  document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, fallback: string, vars?: Record<string, string | number>): string {
  let s = (current !== 'pt' && dicts[current]?.[key]) || fallback;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Formata números conforme o idioma (1.000 / 1,000). */
export function fmt(n: number): string {
  return n.toLocaleString(current === 'pt' ? 'pt-BR' : current);
}
