/* ============================================================
 *  CASA DO BLOOP — catálogo de comidas e decoração (dados puros).
 *  Desenhos das comidas ficam em render.ts (drawFood).
 * ============================================================ */
import { t } from '../i18n';

export type FoodShape = 'cookie' | 'apple' | 'soup' | 'pudding' | 'melon' | 'cake' | 'jelly' | 'carrot';

export interface FoodDef {
  id: string;
  shape: FoodShape;
  name: () => string;
  coins?: number;
  gems?: number;
  /** quanto enche a barriga (0..100) */
  food: number;
  /** alegria extra */
  fun: number;
  /** energia extra */
  energy: number;
}

export const FOODS: FoodDef[] = [
  { id: 'cookie', shape: 'cookie', name: () => t('pet.food.cookie', 'Biscoito Estrela'), coins: 8, food: 10, fun: 2, energy: 0 },
  { id: 'apple', shape: 'apple', name: () => t('pet.food.apple', 'Maçã Crocante'), coins: 12, food: 16, fun: 0, energy: 2 },
  { id: 'carrot', shape: 'carrot', name: () => t('pet.food.carrot', 'Cenourinha'), coins: 14, food: 18, fun: 0, energy: 3 },
  { id: 'soup', shape: 'soup', name: () => t('pet.food.soup', 'Sopinha Quente'), coins: 25, food: 32, fun: 2, energy: 6 },
  { id: 'melon', shape: 'melon', name: () => t('pet.food.melon', 'Melancia'), coins: 30, food: 30, fun: 6, energy: 2 },
  { id: 'pudding', shape: 'pudding', name: () => t('pet.food.pudding', 'Pudim Lunar'), coins: 45, food: 36, fun: 10, energy: 4 },
  { id: 'cake', shape: 'cake', name: () => t('pet.food.cake', 'Bolo Cometa'), coins: 80, food: 55, fun: 18, energy: 6 },
  { id: 'jelly', shape: 'jelly', name: () => t('pet.food.jelly', 'Gelatina Nebulosa'), gems: 3, food: 70, fun: 25, energy: 15 },
];

export const foodById = (id: string): FoodDef | undefined => FOODS.find((f) => f.id === id);

export type DecorKind = 'wall' | 'floor' | 'item';

export interface DecorDef {
  id: string;
  kind: DecorKind;
  name: () => string;
  coins?: number;
  gems?: number;
  /** desbloqueia assistindo N anúncios premiados */
  ads?: number;
  /** desbloqueia ao alcançar este nível do bichinho (grátis) */
  level?: number;
  /** cores usadas pelo desenho */
  colors: [string, string, string];
}

export const DECOR: DecorDef[] = [
  // papéis de parede
  { id: 'wp_dots', kind: 'wall', name: () => t('pet.decor.wp_dots', 'Bolinhas'), colors: ['#ffd6e8', '#ffb8d6', '#ffffff'] },
  { id: 'wp_stripes', kind: 'wall', name: () => t('pet.decor.wp_stripes', 'Listras Menta'), coins: 120, colors: ['#c9f5e4', '#a6ead2', '#ffffff'] },
  { id: 'wp_hearts', kind: 'wall', name: () => t('pet.decor.wp_hearts', 'Coraçõezinhos'), level: 3, colors: ['#ffe6f0', '#ff9cc4', '#ffffff'] },
  { id: 'wp_stars', kind: 'wall', name: () => t('pet.decor.wp_stars', 'Noite Estrelada'), coins: 300, colors: ['#3b2a86', '#5a44b8', '#ffe27a'] },
  { id: 'wp_waves', kind: 'wall', name: () => t('pet.decor.wp_waves', 'Ondas do Mar'), ads: 2, colors: ['#bfe9ff', '#8fd3ff', '#ffffff'] },
  { id: 'wp_candy', kind: 'wall', name: () => t('pet.decor.wp_candy', 'Doce de Nuvem'), gems: 8, colors: ['#fff1c7', '#ffc7e8', '#c7e4ff'] },
  // pisos
  { id: 'fl_wood', kind: 'floor', name: () => t('pet.decor.fl_wood', 'Madeira'), colors: ['#d79a62', '#bf7f4a', '#e8b483'] },
  { id: 'fl_tiles', kind: 'floor', name: () => t('pet.decor.fl_tiles', 'Xadrez Lilás'), coins: 150, colors: ['#e7dcff', '#c6b3ff', '#ffffff'] },
  { id: 'fl_grass', kind: 'floor', name: () => t('pet.decor.fl_grass', 'Gramadinho'), ads: 1, colors: ['#7fd67a', '#5fbf5c', '#a6ec8f'] },
  { id: 'fl_cloud', kind: 'floor', name: () => t('pet.decor.fl_cloud', 'Tapete Nuvem'), level: 8, colors: ['#ffffff', '#e0ecff', '#c9dcff'] },
  // móveis e enfeites
  { id: 'it_plant', kind: 'item', name: () => t('pet.decor.it_plant', 'Plantinha'), coins: 200, colors: ['#4ccf7a', '#2e9e58', '#ff8a5c'] },
  { id: 'it_rug', kind: 'item', name: () => t('pet.decor.it_rug', 'Tapete Redondo'), coins: 180, colors: ['#ff9ec7', '#ffd36b', '#8fd3ff'] },
  { id: 'it_frame', kind: 'item', name: () => t('pet.decor.it_frame', 'Quadro de Planeta'), coins: 250, colors: ['#ffcf2e', '#8a5cff', '#5ef0ff'] },
  { id: 'it_lights', kind: 'item', name: () => t('pet.decor.it_lights', 'Varal de Luzinhas'), ads: 2, colors: ['#ffe27a', '#ff7ab8', '#7af0ff'] },
  { id: 'it_bowl', kind: 'item', name: () => t('pet.decor.it_bowl', 'Aquário Bolha'), gems: 12, colors: ['#8fe3ff', '#ff9a2e', '#ffffff'] },
  { id: 'it_trophy', kind: 'item', name: () => t('pet.decor.it_trophy', 'Troféu de Carinho'), level: 5, colors: ['#ffcf2e', '#e98f00', '#fff6b0'] },
];

export const decorById = (id: string): DecorDef | undefined => DECOR.find((d) => d.id === id);
