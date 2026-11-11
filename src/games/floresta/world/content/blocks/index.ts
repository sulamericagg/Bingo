/* ============================================================
 *  BLOCOS — API pública (ver docs/MUNDO-BLOCOS.md).
 * ============================================================ */
export { BLOCKS, BLOCK_COUNT, CAT_NAMES, COLORS, TILES, block, blockDef, blockForItem, blockNum } from './registry';
export { Group, Render, type BlockCat, type BlockDef, type BlockTool, type Drop, type ShapeKind, type TerrainSampler } from './types';
export { BlockWorld, type BlockHit, type BlockLight, type BlockWorldOptions } from './world';
export { BlockStore, chunkKey, type BlockChunk, type FallMove } from './store';
export { CS as BLOCK_CHUNK, meshChunk, type MeshJob, type MeshOpts, type MeshResult } from './mesher';
export { BLOCK_QUALITY, type BlockQuality } from './quality';
export { breakInfo, rollDrops, type BreakInfo } from './rules';
export { blockIcon, blockIconURL, drawBlockIcon } from './icons';
export { buildAtlas } from './atlas';
export { createBlockMaterials, type BlockMaterials } from './material';
