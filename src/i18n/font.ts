/**
 * Pilha de fontes por idioma. Fredoka (embutida) só cobre latim — para japonês,
 * coreano, chinês e russo caímos em fontes do sistema que têm esses glifos
 * (no Android: Noto Sans CJK / Roboto). O CSS usa var(--font) (definida em styles.css
 * conforme <html lang>); o canvas usa gameFont().
 */
import { getLang, type Lang } from './index';

const BASE = "'Fredoka', system-ui, sans-serif";
const STACKS: Partial<Record<Lang, string>> = {
  ja: "'Fredoka', 'Noto Sans JP', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', system-ui, sans-serif",
  ko: "'Fredoka', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', system-ui, sans-serif",
  zh: "'Fredoka', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif",
  ru: "'Fredoka', 'Nunito', 'Noto Sans', 'Roboto', 'Segoe UI', system-ui, sans-serif",
};

/** font-family para o idioma atual. */
export function fontStack(lang: Lang = getLang()): string {
  return STACKS[lang] ?? BASE;
}

/** Fonte para canvas: gameFont(700, 22) → "700 22px 'Fredoka', …fallbacks". */
export function gameFont(weight: number | string, px: number | string): string {
  return `${weight} ${px}px ${fontStack()}`;
}
