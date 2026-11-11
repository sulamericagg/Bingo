/* Metadados leves dos modos extras (o menu usa sem carregar as cenas). */
import { t } from '../../../i18n';

export type ThemeId = 'hospital' | 'hotel' | 'escola' | 'metro';
export const THEMES: ThemeId[] = ['hospital', 'hotel', 'escola', 'metro'];
export const THEME_META: Record<ThemeId, { icon: string; color: string }> = {
  hospital: { icon: '🏥', color: '#7fe0c8' },
  hotel: { icon: '🛎️', color: '#ffb36b' },
  escola: { icon: '🎒', color: '#ffd34a' },
  metro: { icon: '🚇', color: '#7db3ff' },
};
export function themeName(id: ThemeId): string {
  switch (id) {
    case 'hospital':
      return t('cor.theme.hospital', 'Hospital');
    case 'hotel':
      return t('cor.theme.hotel', 'Hotel');
    case 'escola':
      return t('cor.theme.escola', 'Escola');
    case 'metro':
      return t('cor.theme.metro', 'Metrô');
  }
}
