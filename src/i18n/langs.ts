/**
 * Infra de idioma: lista de idiomas, detecção automática, troca e
 * aplicação de textos estáticos do HTML (atributos data-i18n).
 *
 * Dicionários: cada arquivo src/i18n/locales/<lang>.ts exporta `default` (Record<string,string>).
 * Eles são carregados sob demanda (só o idioma escolhido), nunca no bundle inicial.
 *
 * HTML estático:
 *   <span data-i18n="menu.play">JOGAR</span>          → textContent
 *   <button data-i18n-aria="menu.close" aria-label="Fechar">  → aria-label
 *   <input data-i18n-ph="profile.nick" placeholder="Seu apelido"> → placeholder
 * O texto em português escrito no HTML é o fallback.
 */
import { bus } from '../core/events';
import { getLang, registerLocale, setLang, t, type Lang } from './index';

export interface LangInfo {
  code: Lang;
  /** nome do idioma nele mesmo (não se traduz) */
  native: string;
  /** cor do selo no seletor */
  hue: number;
}

export const LANGUAGES: readonly LangInfo[] = [
  { code: 'pt', native: 'Português', hue: 140 },
  { code: 'en', native: 'English', hue: 210 },
  { code: 'es', native: 'Español', hue: 30 },
  { code: 'de', native: 'Deutsch', hue: 50 },
  { code: 'fr', native: 'Français', hue: 230 },
  { code: 'it', native: 'Italiano', hue: 120 },
  { code: 'ja', native: '日本語', hue: 350 },
  { code: 'ko', native: '한국어', hue: 260 },
  { code: 'ru', native: 'Русский', hue: 200 },
  { code: 'tr', native: 'Türkçe', hue: 0 },
  { code: 'id', native: 'Bahasa Indonesia', hue: 10 },
  { code: 'zh', native: '中文', hue: 15 },
];

const STORE_KEY = 'bo-lang';
const CODES = LANGUAGES.map((l) => l.code) as string[];

/** Mapeia navigator.language(s) para um dos idiomas suportados (padrão: pt). */
export function detectLang(): Lang {
  const list: string[] = [];
  try {
    if (navigator.languages) list.push(...navigator.languages);
    if (navigator.language) list.push(navigator.language);
  } catch {
    /* */
  }
  for (const raw of list) {
    const base = raw.toLowerCase().split(/[-_]/)[0];
    if (base === 'in') return 'id'; // código antigo do indonésio
    if (base === 'ms') return 'id';
    if (CODES.includes(base)) return base as Lang;
  }
  return 'pt';
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v && CODES.includes(v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

const locales = import.meta.glob<{ default: Record<string, string> }>('./locales/*.ts');
const loaded = new Set<Lang>(['pt']);

async function loadLocale(lang: Lang): Promise<void> {
  if (loaded.has(lang)) return;
  const imp = locales[`./locales/${lang}.ts`];
  if (!imp) return;
  try {
    const mod = await imp();
    registerLocale(lang, mod.default);
    loaded.add(lang);
  } catch {
    /* sem dicionário: usa o português */
  }
}

/**
 * Chame uma vez no boot, antes de montar a UI. Usa o idioma salvo ou, na
 * primeira execução, detecta pelo aparelho. O dicionário carrega em segundo
 * plano e, quando chega, dispara bus 'lang' para a UI se re-traduzir.
 */
export function initLang(): Lang {
  const lang = storedLang() ?? detectLang();
  setLang(lang);
  if (lang !== 'pt') loadLocale(lang).then(() => getLang() === lang && bus.emit('lang', lang));
  return lang;
}

/** Troca o idioma (seletor dos Ajustes): carrega o dicionário, aplica e avisa (bus 'lang'). */
export async function changeLang(lang: Lang): Promise<void> {
  await loadLocale(lang);
  setLang(lang);
  applyI18n(document);
  bus.emit('lang', lang);
}

export function langInfo(code: Lang = getLang()): LangInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/* ---------------- textos estáticos do HTML ---------------- */

const ORIG = new WeakMap<Element, { text?: string; aria?: string; ph?: string }>();

/** Traduz os elementos com data-i18n / data-i18n-aria / data-i18n-ph dentro de `root`. */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n],[data-i18n-aria],[data-i18n-ph]').forEach((el) => {
    let o = ORIG.get(el);
    if (!o) {
      o = {
        text: el.dataset.i18n ? (el.textContent ?? '') : undefined,
        aria: el.dataset.i18nAria ? (el.getAttribute('aria-label') ?? '') : undefined,
        ph: el.dataset.i18nPh ? (el.getAttribute('placeholder') ?? '') : undefined,
      };
      ORIG.set(el, o);
    }
    if (el.dataset.i18n && o.text !== undefined) {
      const v = t(el.dataset.i18n, o.text);
      if (el.textContent !== v) el.textContent = v;
    }
    if (el.dataset.i18nAria && o.aria !== undefined) el.setAttribute('aria-label', t(el.dataset.i18nAria, o.aria));
    if (el.dataset.i18nPh && o.ph !== undefined) el.setAttribute('placeholder', t(el.dataset.i18nPh, o.ph));
  });
}
