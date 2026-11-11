/* ============================================================
 *  BLOOP CINEMA — elenco pronto (personagens originais).
 *  Arquivo puro (sem DOM/i18n): usado pelo app, pelos filmes do
 *  Estúdio Bloop (tvfilms/) e pelo gerador em Node.
 * ============================================================ */
import type { AvatarData } from '../game/avatar';

export interface Preset {
  id: string;
  name: string;
  av: AvatarData;
}
export const av = (body: string, mat: string, pat: string, eyes: string, mouth: string, head: string, face: string, back: string, P: string, S: string): AvatarData => ({
  parts: { body, material: mat, pattern: pat, eyes, mouth, head, face, back, aura: 'a_none' },
  colors: { primary: P, secondary: S },
});
/** Personagens originais do Bloop Cinema (atores — não ficam equipados no jogador). */
export const PRESETS: Preset[] = [
  { id: 'pipoca', name: 'Pipoca', av: av('b_round', 'm_soft', 'p_belly', 'e_cute', 'mo_smile', 'h_cap', 'f_blush', 'k_none', '#ffd93b', '#ff8f3b') },
  { id: 'bolota', name: 'Bolota', av: av('b_bean', 'm_plush', 'p_spots', 'e_big', 'mo_cat', 'h_cat', 'f_none', 'k_tail', '#ff8fb8', '#ffffff') },
  { id: 'trovao', name: 'Trovão', av: av('b_square', 'm_soft', 'p_stripes', 'e_angry', 'mo_grin', 'h_headphones', 'f_none', 'k_backpack', '#4f7dff', '#ffd93b') },
  { id: 'lumi', name: 'Lumi', av: av('b_drop', 'm_jelly', 'p_stars', 'e_big', 'mo_smile', 'h_bow', 'f_freckles', 'k_fairy', '#3fc8ff', '#d77bff') },
  { id: 'zeca', name: 'Zeca', av: av('b_egg', 'm_clay', 'p_none', 'e_sleepy', 'mo_tooth', 'h_beanie', 'f_glasses', 'k_none', '#9be15d', '#3ecf8e') },
  { id: 'gema', name: 'Vovó Gema', av: av('b_cloud', 'm_pearl', 'p_none', 'e_cute', 'mo_smile', 'h_none', 'f_glasses', 'k_none', '#e9dcff', '#9b6bff') },
  { id: 'bolha', name: 'Prof. Bolha', av: av('b_round', 'm_soft', 'p_belly', 'e_cute', 'mo_mustache', 'h_tophat', 'f_monocle', 'k_none', '#c9b8a3', '#8a5a3c') },
  { id: 'faisca', name: 'Faísca', av: av('b_star', 'm_soft', 'p_none', 'e_star', 'mo_grin', 'h_none', 'f_none', 'k_cape', '#ff5c5c', '#ffd93b') },
  { id: 'nina', name: 'Nina', av: av('b_heart', 'm_soft', 'p_hearts', 'e_big', 'mo_kiss', 'h_bow', 'f_blush', 'k_angel', '#ffb3d1', '#ff5c8a') },
  { id: 'robozinho', name: 'Bip', av: av('b_square', 'm_metal', 'p_circuit', 'e_robot', 'mo_robot', 'h_antenna', 'f_none', 'k_jetpack', '#b8c4d6', '#3fc8ff') },
];
export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
