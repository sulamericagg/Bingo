/* ============================================================
 *  BICHOS — CHEFES (dados). A luta fica em boss.ts.
 *  · Brasalume, a Dragoa-Lanterna (covil vulcânico: montanhas/deserto/savana)
 *  · Colosso Geodo (câmara funda de cristais, debaixo dos biomas frios/mágicos)
 *  · Nenúfera, a Hidra-Lírio (lagoa do pântano) — cabeças-flor que murcham,
 *    e botões de cura que precisam ser colhidos antes de desabrochar.
 * ============================================================ */
import { t } from '../../../../../i18n';
import type { MobDef } from './types';

type B = Omit<MobDef, 'kind' | 'temper' | 'spawn'>;
const b = (d: B): MobDef => ({ kind: 'boss', temper: 'hostile', spawn: [], vary: 0, ...d });

export const BOSS_DEFS: MobDef[] = [
  b({
    id: 'brasalume', name: () => t('mob.brasalume', 'Brasalume, a Dragoa-Lanterna'), habitat: 'ground', hp: 900, speed: 3.5, run: 18, radius: 3.0,
    plan: {
      form: 'quad', body: [5, 3, 3.4], col: '#ff6a5a', belly: '#ffd8a0', pattern: 'patch', patCol: '#d84a5a',
      head: { r: 1.0, snout: 1.7, snoutCol: '#ff8a7a', horns: 'spike', hornCol: '#fff4d0', crest: '#ffd34a', eye: 1.1, blush: true },
      neck: { len: 2.8, w: 0.55, tilt: 0.7 }, legs: { n: 4, len: 1.5, w: 0.75, col: '#d84a5a' },
      tail: { kind: 'thin', len: 5, col: '#ff6a5a' }, wings: { span: 11, kind: 'bat', col: '#ffb02e' }, spikes: '#ffd34a', glow: '#ffb02e',
    },
    drops: [{ id: 'escama_dragao', min: 6, max: 10 }, { id: 'coracao_brasa', min: 1, max: 1 }, { id: 'gema', min: 3, max: 5 }, { id: 'barra_ouro', min: 4, max: 8 }, { id: 'ovo_dragao', min: 1, max: 1, chance: 0.5 }],
    coins: 400,
  }),
  b({
    id: 'colosso_geodo', name: () => t('mob.colossoGeodo', 'Colosso Geodo'), habitat: 'ground', hp: 1100, speed: 2.2, run: 3.5, radius: 2.4,
    plan: {
      form: 'biped', body: [2.4, 3.2, 3.2], col: '#6a6478', pattern: 'spots', patCol: '#57516a',
      head: { r: 0.85, col: '#7a748a', eye: 1.0, horns: 'stub', hornCol: '#ff7ab0' },
      legs: { n: 2, len: 1.7, w: 1.0, col: '#5a5468' }, arms: { len: 3.0, w: 1.0, col: '#5a5468' }, spikes: '#ff7ab0', glow: '#ff7ab0',
    },
    drops: [{ id: 'nucleo_geodo', min: 1, max: 1 }, { id: 'cristal', min: 10, max: 16 }, { id: 'gema', min: 2, max: 4 }, { id: 'quartzo', min: 4, max: 8 }, { id: 'barra_prata', min: 4, max: 6 }],
    coins: 450,
  }),
  b({
    id: 'nenufera', name: () => t('mob.nenufera', 'Nenúfera, a Hidra-Lírio'), habitat: 'amphib', hp: 420, speed: 0, run: 0, radius: 3.2,
    plan: { form: 'blob', body: [6.5, 2.0, 6.5], col: '#4a9a5a', pattern: 'spots', patCol: '#7ac06a', head: { r: 0.9, eye: 1.3, blush: true }, bulb: '#ff8ac8' },
    drops: [{ id: 'petala_eterna', min: 1, max: 1 }, { id: 'semente_lirio', min: 3, max: 5 }, { id: 'gema', min: 2, max: 3 }, { id: 'casca', min: 6, max: 10 }],
    coins: 380,
  }),
  b({
    id: 'nenufera_cabeca', name: () => t('mob.nenuferaCabeca', 'Cabeça-Lírio'), habitat: 'amphib', hp: 110, speed: 0, run: 0, radius: 0.9,
    plan: { form: 'plant', body: [1.0, 5.0, 1.0], col: '#3a8a4a', head: { r: 0.85, col: '#ff8ac8', crest: '#ffd34a', eye: 1.2, blush: true }, glow: '#ffd34a' },
    drops: [],
  }),
  b({
    id: 'flor_cura', name: () => t('mob.florCura', 'Botão-Cura'), habitat: 'amphib', hp: 6, speed: 0, run: 0, radius: 0.5,
    plan: { form: 'plant', body: [0.5, 1.1, 0.5], col: '#5ab05a', head: { r: 0.32, col: '#e8fff0', eye: 0.8 }, glow: '#7affc4' },
    drops: [{ id: 'po_brilho', min: 1, max: 1 }],
  }),
];

/** o que levar para cada chefe (dicas para a interface/guia) */
export const BOSS_PREP: Record<string, { armor: number; potions: string[]; tools: string[]; tip: () => string }> = {
  brasalume: { armor: 2, potions: ['pocao_brasa', 'pocao_vida'], tools: ['sling', 'boomerang'], tip: () => t('mob.tip.brasalume', 'Poção de brasa contra o fogo; no ar ela só leva dano de longe. Depois do tombo, ataque!') },
  colosso_geodo: { armor: 3, potions: ['pocao_vida', 'pocao_pulo'], tools: ['tnt', 'hammer'], tip: () => t('mob.tip.geodo', 'A casca é duríssima: bata quando o núcleo brilhar ou use explosivos. Pule as ondas!') },
  nenufera: { armor: 2, potions: ['pocao_antidoto', 'pocao_vida'], tools: ['sling', 'sword'], tip: () => t('mob.tip.nenufera', 'Murche as três cabeças e colha os botões-cura antes que desabrochem!') },
};
