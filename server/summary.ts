import { CATALOG_SKINS, CATALOG_TRAILS } from '../shared/catalog';
import { packSummary, type RewardPack } from '../shared/reward';

const NAMES: Record<string, string> = {};
for (const s of CATALOG_SKINS) NAMES[s.id] = s.name;
for (const t of CATALOG_TRAILS) NAMES['trail:' + t.id] = t.name;

/** Resumo em pt-BR do pacote, com nomes reais das skins/rastros. */
export const codeSummary = (p: RewardPack): string => packSummary(p, NAMES);
