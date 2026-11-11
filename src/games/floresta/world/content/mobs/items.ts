/* ============================================================
 *  BICHOS — itens novos que os bichos soltam (o motor registra no
 *  catálogo dele). Formas de ícone = as do catálogo do mundo (Shape).
 *  Itens já existentes no mundo (pena, la, ovo, gosma, casca, po_sombra,
 *  espinho, cristal, gema, cogumelo, fibra, pedra, areia, neve,
 *  barra_ferro/prata/ouro, min_cobre, folha) NÃO estão aqui.
 * ============================================================ */
import { t } from '../../../../../i18n';

export interface MobItem {
  id: string;
  name: () => string;
  cat: 'rec' | 'comida';
  /** forma do ícone (mesmas do catálogo do mundo) */
  ic: { s: string; c: string; c2?: string };
  food?: number;
  stack?: number;
  /** cozinha em (fornalha/fogueira) → item */
  cook?: string;
}

export const MOB_ITEMS: MobItem[] = [
  { id: 'couro', name: () => t('mob.i.couro', 'Couro'), cat: 'rec', ic: { s: 'cloth', c: '#b07a4a', c2: '#8a5a32' } },
  { id: 'carne_crua', name: () => t('mob.i.carneCrua', 'Carne Crua'), cat: 'comida', ic: { s: 'skewer', c: '#ff8a8a', c2: '#fff0e0' }, food: 2, cook: 'carne_assada' },
  { id: 'carne_assada', name: () => t('mob.i.carneAssada', 'Churrasquinho'), cat: 'comida', ic: { s: 'skewer', c: '#b8603a', c2: '#ffd08a' }, food: 8 },
  { id: 'peixe', name: () => t('mob.i.peixe', 'Peixe'), cat: 'comida', ic: { s: 'leaf', c: '#7ab0f0', c2: '#e8f4ff' }, food: 2, cook: 'peixe_assado' },
  { id: 'peixe_assado', name: () => t('mob.i.peixeAssado', 'Peixe Assado'), cat: 'comida', ic: { s: 'leaf', c: '#d8944a', c2: '#ffe0a0' }, food: 7 },
  { id: 'leite', name: () => t('mob.i.leite', 'Leite'), cat: 'comida', ic: { s: 'cup', c: '#ffffff', c2: '#bfeaff' }, food: 3 },
  { id: 'mel', name: () => t('mob.i.mel', 'Mel'), cat: 'comida', ic: { s: 'drop', c: '#ffc02e' }, food: 4 },
  { id: 'abobora', name: () => t('mob.i.abobora', 'Abóbora'), cat: 'comida', ic: { s: 'pumpkin', c: '#ff8a2e', c2: '#5cc24a' }, food: 3 },
  { id: 'cacto_fruta', name: () => t('mob.i.cactoFruta', 'Fruta de Cacto'), cat: 'comida', ic: { s: 'fruit', c: '#ff7ab0', c2: '#4aa85a' }, food: 3 },
  { id: 'escama', name: () => t('mob.i.escama', 'Escama'), cat: 'rec', ic: { s: 'shell', c: '#5ad0a0', c2: '#bff6e0' } },
  { id: 'chifre', name: () => t('mob.i.chifre', 'Chifre'), cat: 'rec', ic: { s: 'spike', c: '#f4ead0' } },
  { id: 'seda', name: () => t('mob.i.seda', 'Seda de Cristal'), cat: 'rec', ic: { s: 'wool', c: '#f4f8ff', c2: '#bff6ff' } },
  { id: 'po_brilho', name: () => t('mob.i.poBrilho', 'Pó de Brilho'), cat: 'rec', ic: { s: 'dust', c: '#9affe0' } },
  { id: 'brasa', name: () => t('mob.i.brasa', 'Brasa Viva'), cat: 'rec', ic: { s: 'gem', c: '#ff8a2e', c2: '#ffd34a' } },
  { id: 'ambar', name: () => t('mob.i.ambar', 'Âmbar'), cat: 'rec', ic: { s: 'gem', c: '#ffc02e', c2: '#fff09a' } },
  { id: 'gelo_eterno', name: () => t('mob.i.geloEterno', 'Gelo Eterno'), cat: 'rec', ic: { s: 'gem', c: '#bff0ff', c2: '#ffffff' } },
  { id: 'quartzo', name: () => t('mob.i.quartzo', 'Quartzo Rosa'), cat: 'rec', ic: { s: 'gem', c: '#ffa8d0', c2: '#ffe0f0' } },
  // tesouros dos chefes
  { id: 'escama_dragao', name: () => t('mob.i.escamaDragao', 'Escama de Dragoa'), cat: 'rec', ic: { s: 'shell', c: '#ff6a5a', c2: '#ffd34a' } },
  { id: 'coracao_brasa', name: () => t('mob.i.coracaoBrasa', 'Coração de Brasa'), cat: 'rec', ic: { s: 'gem', c: '#ff4a5a', c2: '#ffd34a' }, stack: 8 },
  { id: 'ovo_dragao', name: () => t('mob.i.ovoDragao', 'Ovo de Dragoa'), cat: 'rec', ic: { s: 'egg', c: '#ffb02e', c2: '#ff6a5a' }, stack: 1 },
  { id: 'nucleo_geodo', name: () => t('mob.i.nucleoGeodo', 'Núcleo de Geodo'), cat: 'rec', ic: { s: 'gem', c: '#ff7ab0', c2: '#7af0ff' }, stack: 8 },
  { id: 'petala_eterna', name: () => t('mob.i.petalaEterna', 'Pétala Eterna'), cat: 'rec', ic: { s: 'flower', c: '#ff8ac8', c2: '#ffd34a' }, stack: 8 },
  { id: 'semente_lirio', name: () => t('mob.i.sementeLirio', 'Semente de Lírio'), cat: 'rec', ic: { s: 'seed', c: '#7affc4' } },
];
