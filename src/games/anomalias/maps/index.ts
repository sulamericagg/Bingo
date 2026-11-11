/* ============================================================
 *  ANOMALIAS — registro dos mapas.
 *  Cada mapa é carregado sob demanda (import dinâmico) para o APK abrir rápido.
 *  Para LIGAR um mapa novo depois do merge: descomente a linha dele em LOADERS
 *  (o módulo deve exportar `default` ou `map` do tipo MapDef). Mapa sem loader
 *  aparece no menu como "Em breve".
 * ============================================================ */
import type { MapDef } from './types';

export interface MapMeta {
  id: string;
  /** chave i18n + texto pt-BR do nome (o menu usa t(key, pt)) */
  key: string;
  pt: string;
  icon: string;
  /** cor do cartão no menu */
  color: string;
}

/** Ordem do menu. Nome/ícone ficam aqui para o "Em breve" funcionar sem o módulo. */
export const MAP_META: MapMeta[] = [
  { id: 'hospital', key: 'ano.map.hospital', pt: 'Hospital', icon: '🏥', color: '#4fb3c9' },
  { id: 'creche', key: 'ano.map.creche', pt: 'Creche', icon: '🧸', color: '#f48fb1' },
  { id: 'cabanas', key: 'ano.map.cabanas', pt: 'Cabanas', icon: '🛖', color: '#8d6e63' },
  { id: 'fastfood', key: 'ano.map.fastfood', pt: 'Lanchonete', icon: '🍔', color: '#ffb300' },
  { id: 'posto24h', key: 'ano.map.posto24h', pt: 'Posto 24h', icon: '⛽', color: '#66bb6a' },
];

type Loader = () => Promise<{ default?: MapDef; map?: MapDef }>;

/** Uma linha por mapa — é só isto que os merges mexem. */
export const LOADERS: Record<string, Loader> = {
  hospital: () => import('./hospital'),
  creche: () => import('./creche'),
  cabanas: () => import('./cabanas'),
  // fastfood: () => import('./fastfood'),
  // posto24h: () => import('./posto24h'),
};

export const mapAvailable = (id: string): boolean => !!LOADERS[id];

export async function loadMap(id: string): Promise<MapDef> {
  const l = LOADERS[id];
  if (!l) throw new Error('mapa indisponível: ' + id);
  const m = await l();
  const def = m.default ?? m.map;
  if (!def) throw new Error('mapa sem export default/map: ' + id);
  return def;
}
