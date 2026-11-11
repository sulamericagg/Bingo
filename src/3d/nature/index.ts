/* ============================================================
 *  NATUREZA 3D compartilhada (mundo aberto, Lenhadores 3D, Noites):
 *  árvores estilizadas, decoração instanciada, grama de lâminas na GPU,
 *  vento no shader, chão com detalhe, céu em degradê, sombras de contato.
 * ============================================================ */
export { natureTree, type TreeKind, type TreeSpec } from './trees';
export { natureBush, natureBerryBush, natureFern, natureFlowers, natureRock, natureTuft } from './deco';
export { GrassField, type GrassQ, type GrassSource } from './grass';
export { groundDetail, groundDetailTexture, natureAnisotropy, SkyDome, BlobShadows } from './ground';
export { natureWind, natureMat, windTime, type WindOpts } from './wind';
export { natureQ, type NatureQ } from './quality';
export { Mesher, blob, canopy, trunk, branch } from './mesher';
export { fbm2, vnoise2, vnoise3, hash2, hash3, rng } from './noise';
export { natureLeafCards, leafCardMat, leafAtlas } from './leaves';
