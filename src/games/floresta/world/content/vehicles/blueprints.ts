/* ============================================================
 *  VEÍCULOS DO MUNDO — 10 projetos prontos (plantas), em ordem de
 *  progressão: carrinho de mão → carroça → kart → picape → trator +
 *  reboque → caminhão-tora → escavadeira → barco → ultraleve → helicóptero.
 *  São projetos comuns (VehicleDesign): o jogador abre na garagem,
 *  fabrica as peças que faltam e monta.
 * ============================================================ */
import { t } from '../../../../../i18n';
import type { PlacedPart, Rot, VehicleDesign } from './design';

export interface Blueprint {
  id: string;
  name: () => string;
  desc: () => string;
  design: VehicleDesign;
  /** reboque que acompanha (trator) */
  trailer?: VehicleDesign;
}

type Row = [string, number, number, Rot?];
const D = (id: string, chassis: string, paint: string, rows: Row[]): VehicleDesign => ({
  v: 1,
  id: 'bp_' + id,
  name: '',
  chassis,
  paint,
  parts: rows.map(([p, x, z, r]): PlacedPart => ({ p, x, z, r: r ?? 0 })),
});

export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'carrinho',
    name: () => t('mveic.bp.carrinho', 'Carrinho de Mão'),
    desc: () => t('mveic.bp.carrinhoD', 'Empurre com as pernas e leve 3 toras.'),
    design: D('carrinho', 'vp_chassi_p', '#d8a060', [
      ['vp_roda_madeira', 1, 0], ['vp_roda_madeira', 0, 3], ['vp_roda_madeira', 2, 3],
      ['vp_cacamba_p', 0, 0], ['vp_motor_pedal', 2, 1], ['vp_banco', 1, 3],
    ]),
  },
  {
    id: 'carroca',
    name: () => t('mveic.bp.carroca', 'Carroça'),
    desc: () => t('mveic.bp.carrocaD', 'Dois pedais e uma caçamba de verdade.'),
    design: D('carroca', 'vp_chassi_m', '#c8925a', [
      ['vp_roda_madeira', 0, 1], ['vp_roda_madeira', 3, 1], ['vp_roda_madeira', 0, 4], ['vp_roda_madeira', 3, 4],
      ['vp_motor_pedal', 0, 1], ['vp_motor_pedal', 3, 1], ['vp_banco', 1, 1], ['vp_cacamba', 0, 2], ['vp_compartimento', 3, 3],
    ]),
  },
  {
    id: 'kart',
    name: () => t('mveic.bp.kart', 'Kart'),
    desc: () => t('mveic.bp.kartD', 'Pequeno, leve e rápido. Motor a lenha.'),
    design: D('kart', 'vp_chassi_p', '#ff4f6a', [
      ['vp_roda_borracha', 0, 0], ['vp_roda_borracha', 2, 0], ['vp_roda_borracha', 0, 3], ['vp_roda_borracha', 2, 3],
      ['vp_banco', 1, 1], ['vp_motor_lenha', 1, 2],
    ]),
  },
  {
    id: 'picape',
    name: () => t('mveic.bp.picape', 'Picape'),
    desc: () => t('mveic.bp.picapeD', 'Caçamba para 8 toras, faróis e tanque extra.'),
    design: D('picape', 'vp_chassi_m', '#3a8aff', [
      ['vp_roda_borracha', 0, 1], ['vp_roda_borracha', 3, 1], ['vp_roda_borracha', 0, 4], ['vp_roda_borracha', 3, 4],
      ['vp_farol', 0, 0], ['vp_motor_comb', 1, 0], ['vp_tanque', 2, 0], ['vp_farol', 3, 0],
      ['vp_compartimento', 0, 1], ['vp_banco', 2, 1],
      ['vp_cacamba', 0, 2], ['vp_engate', 3, 5],
    ]),
  },
  {
    id: 'trator',
    name: () => t('mveic.bp.trator', 'Trator com Reboque'),
    desc: () => t('mveic.bp.tratorD', 'Rodas gigantes, arado e um reboque para 8 toras.'),
    design: D('trator', 'vp_chassi_m', '#3ec05a', [
      ['vp_roda_grande', 0, 1], ['vp_roda_grande', 3, 1], ['vp_roda_grande', 0, 4], ['vp_roda_grande', 3, 4],
      ['vp_farol', 0, 0], ['vp_motor_comb', 1, 0], ['vp_farol', 3, 0], ['vp_banco', 2, 2], ['vp_tanque', 1, 2],
      ['vp_engate', 1, 5], ['vp_arado', 2, 5],
    ]),
    trailer: D('reboque', 'vp_chassi_m', '#3ec05a', [
      ['vp_engate', 1, 0], ['vp_roda_borracha', 0, 2], ['vp_roda_borracha', 3, 2], ['vp_roda_borracha', 0, 4], ['vp_roda_borracha', 3, 4],
      ['vp_cacamba', 0, 1], ['vp_compartimento', 3, 1], ['vp_compartimento', 3, 2],
    ]),
  },
  {
    id: 'caminhao',
    name: () => t('mveic.bp.caminhao', 'Caminhão Toreiro'),
    desc: () => t('mveic.bp.caminhaoD', 'Guindaste e duas caçambas: 16 toras.'),
    design: D('caminhao', 'vp_chassi_g', '#3a8aff', [
      ['vp_roda_grande', 0, 1], ['vp_roda_grande', 4, 1], ['vp_roda_grande', 0, 7], ['vp_roda_grande', 4, 7], ['vp_roda_grande', 0, 9], ['vp_roda_grande', 4, 9],
      ['vp_farol', 0, 0], ['vp_motor_comb', 1, 0], ['vp_tanque', 2, 0], ['vp_motor_comb', 3, 0], ['vp_farol', 4, 0],
      ['vp_banco', 2, 1], ['vp_grua', 2, 2], ['vp_cacamba', 1, 3], ['vp_cacamba', 1, 7], ['vp_engate', 0, 10],
    ]),
  },
  {
    id: 'escavadeira',
    name: () => t('mveic.bp.escavadeira', 'Escavadeira'),
    desc: () => t('mveic.bp.escavadeiraD', 'Esteiras, broca que cava e braço guindaste.'),
    design: D('escavadeira', 'vp_chassi_m', '#ffb02e', [
      ['vp_esteira', 0, 1], ['vp_esteira', 3, 1],
      ['vp_blindagem', 0, 0], ['vp_broca', 1, 0], ['vp_farol', 2, 0], ['vp_blindagem', 3, 0],
      ['vp_banco', 2, 2], ['vp_motor_comb', 1, 2], ['vp_grua', 2, 4], ['vp_compartimento', 1, 5], ['vp_compartimento', 2, 5],
    ]),
  },
  {
    id: 'barco',
    name: () => t('mveic.bp.barco', 'Barco'),
    desc: () => t('mveic.bp.barcoD', 'Quatro boias e uma hélice. Leva carga pelo rio.'),
    design: D('barco', 'vp_chassi_m', '#ff8a3a', [
      ['vp_boia', 0, 0], ['vp_boia', 3, 0], ['vp_boia', 0, 3], ['vp_boia', 3, 3],
      ['vp_banco', 1, 2], ['vp_compartimento', 2, 1], ['vp_motor_lenha', 2, 3], ['vp_cacamba_p', 0, 3], ['vp_helice', 2, 5],
    ]),
  },
  {
    id: 'ultraleve',
    name: () => t('mveic.bp.ultraleve', 'Ultraleve'),
    desc: () => t('mveic.bp.ultraleveD', 'Asas, hélice e motor elétrico. Corra e decole!'),
    design: D('ultraleve', 'vp_chassi_p', '#f4f6fc', [
      ['vp_roda_borracha', 1, 0], ['vp_roda_borracha', 0, 3], ['vp_roda_borracha', 2, 3],
      ['vp_asa', 0, 1], ['vp_asa', 2, 1], ['vp_banco', 1, 1], ['vp_motor_eletr', 1, 2], ['vp_helice', 1, 3],
    ]),
  },
  {
    id: 'helicoptero',
    name: () => t('mveic.bp.helicoptero', 'Helicóptero'),
    desc: () => t('mveic.bp.helicopteroD', 'Rotor no meio e dois motores elétricos.'),
    design: D('helicoptero', 'vp_chassi_m', '#8a5cff', [
      ['vp_roda_borracha', 0, 1], ['vp_roda_borracha', 3, 1], ['vp_roda_borracha', 0, 4], ['vp_roda_borracha', 3, 4],
      ['vp_banco', 1, 1], ['vp_rotor', 1, 2], ['vp_motor_eletr', 2, 2], ['vp_motor_eletr', 1, 3], ['vp_helice', 1, 5],
    ]),
  },
];
export const BLUEPRINT = new Map(BLUEPRINTS.map((b) => [b.id, b]));
