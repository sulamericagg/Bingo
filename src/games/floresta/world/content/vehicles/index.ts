/* ============================================================
 *  VEÍCULOS DO MUNDO — API pública (ver docs/MUNDO-VEICULOS.md).
 *  Sistema autocontido: peças fabricáveis → garagem de encaixe →
 *  veículos com física cannon-es (rodas, esteiras, barco, ar),
 *  carga física, combustível, dano/reparo e ferramentas de terreno.
 * ============================================================ */
export { CELL, PARTS, PART, VEH_RECIPES, FUEL_ITEMS, EXTRA_ITEMS, RAW_MATS, vItemName, vItemColor, fuelName } from './parts';
export type { PartDef, PartCat, FuelKind, Station, VRecipe, ExtraItem } from './parts';
export { analyze, layout, newDesign, cloneDesign, place, removeAt, canPlace, setChassis, bill, encodeDesign, decodeDesign, PAINTS, MASS_KG, LOG_MASS, DRIVER } from './design';
export type { VehicleDesign, PlacedPart, Analysis, VKind, Rot, Layout } from './design';
export { BLUEPRINTS, BLUEPRINT, type Blueprint } from './blueprints';
export { craft, craftable, craftMissing, missingParts, assemble, disassemble, stationOk, recipeFor, MemInventory, type VInventory } from './crafting';
export { Vehicle, VEH_GROUP, type VehicleHost, type VInput, type VehicleState, type VSound } from './vehicle';
export { VehicleManager, VEH_CAPS, type VTier, type SavedVehicles } from './manager';
export { ChaseCam } from './camera';
export { DriveHud, type HudCallbacks } from './hud';
export { openGarage, type GarageOptions, type GarageHandle } from './garage';
export { buildVehicleModel, vehicleMaterial, type VehicleModel } from './models';
export { localDesigns, type DesignStore } from './store';
export { partIcon, UI_ICONS } from './icons';
