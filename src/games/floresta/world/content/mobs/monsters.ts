/* ============================================================
 *  BICHOS — MONSTROS (assustadinhos-fofos). Só dados.
 *  Cada um tem uma mecânica (`mech`) tratada em ai.ts.
 *  Derrota = "puf" de brilhinhos (sem sangue, sem restos).
 * ============================================================ */
import { t } from '../../../../../i18n';
import type { MobDef } from './types';

type M = Omit<MobDef, 'kind' | 'temper'>;
const m = (d: M): MobDef => ({ kind: 'monster', temper: 'hostile', vary: 0.1, ...d });

export const MONSTERS: MobDef[] = [
  m({
    id: 'gosmito', name: () => t('mob.gosmito', 'Gosmito'), habitat: 'ground', hp: 16, speed: 1.6, run: 3.2, radius: 0.55, mech: 'split', hops: true, sense: 16,
    plan: { form: 'blob', body: [1.0, 0.85, 1.0], col: '#7aff8a', glow: '#3ad06a', head: { r: 0.3, eye: 1.4, blush: true } },
    attack: { dmg: 3, reach: 1.3, cd: 1.2, windup: 0.3, kind: 'poison' },
    drops: [{ id: 'gosma', min: 1, max: 2 }],
    spawn: [{ biomes: ['bosque', 'pantano', 'tropical', 'bambu'], group: [1, 2], weight: 10, time: 'night' }, { biomes: ['caverna'], group: [1, 2], weight: 6, depth: [4, 40] }],
    coins: 2,
  }),
  m({
    id: 'pulapulga', name: () => t('mob.pulapulga', 'Pulapulga'), habitat: 'ground', hp: 10, speed: 1.5, run: 4, radius: 0.4, mech: 'hop', sense: 18,
    plan: { form: 'bug', body: [0.6, 0.4, 0.45], col: '#8a4aff', shell: '#b07aff', head: { r: 0.18, eye: 1.5, antennae: '#ff5af0' }, legs: { n: 6, len: 0.35, w: 0.05, col: '#4a2a8a' }, glow: '#ff5af0' },
    attack: { dmg: 4, reach: 1.4, cd: 2.2, windup: 0.5 },
    drops: [{ id: 'casca', min: 0, max: 1 }, { id: 'po_sombra', min: 0, max: 1, chance: 0.5 }],
    spawn: [{ biomes: ['savana', 'deserto', 'bosque'], group: [2, 3], weight: 8, time: 'night' }],
    coins: 2,
  }),
  m({
    id: 'cuspilho', name: () => t('mob.cuspilho', 'Cuspilho'), habitat: 'ground', hp: 14, speed: 0.6, run: 1.4, radius: 0.5, mech: 'spit', sense: 20,
    plan: { form: 'plant', body: [0.7, 1.4, 0.7], col: '#4aa85a', head: { r: 0.32, col: '#ff5a8a', eye: 1.2, crest: '#ffd34a' }, glow: '#ffd34a' },
    attack: { dmg: 4, reach: 13, cd: 2.4, windup: 0.6, kind: 'poison', effect: 'slow', proj: { speed: 11, col: '#c8ff4a', r: 0.22, arc: true } },
    drops: [{ id: 'fibra', min: 1, max: 3 }, { id: 'espinho', min: 0, max: 2 }],
    spawn: [{ biomes: ['pantano', 'tropical'], group: [1, 2], weight: 7, time: 'night' }, { biomes: ['caverna'], group: [1, 1], weight: 3, depth: [10, 60] }],
    coins: 3,
  }),
  m({
    id: 'cavucao', name: () => t('mob.cavucao', 'Cavucão'), habitat: 'ground', hp: 22, speed: 2.5, run: 6, radius: 0.6, mech: 'burrow', sense: 22,
    plan: { form: 'worm', body: [2.2, 0.7, 0.7], col: '#d8946a', pattern: 'band', patCol: '#b06a4a', head: { r: 0.4, col: '#e8a47a', eye: 1.1, horns: 'spike', hornCol: '#fff4d0' }, glow: '#ff8a3a' },
    attack: { dmg: 6, reach: 2.2, cd: 3.5, windup: 0.9, kind: 'blast' },
    drops: [{ id: 'areia', min: 2, max: 4 }, { id: 'ambar', min: 0, max: 1, chance: 0.3 }],
    spawn: [{ biomes: ['deserto', 'savana'], group: [1, 1], weight: 5, time: 'night' }, { biomes: ['caverna'], group: [1, 1], weight: 3, depth: [8, 50] }],
    coins: 4,
  }),
  m({
    id: 'zumbizim', name: () => t('mob.zumbizim', 'Zumbizim'), habitat: 'air', hp: 3, speed: 4, run: 7, radius: 0.18, mech: 'swarm', alt: [1.2, 2.4], sense: 18,
    plan: { form: 'bug', body: [0.22, 0.16, 0.14], col: '#2a2a3a', pattern: 'stripes', patCol: '#ffd34a', head: { r: 0.08, eye: 1.6 }, wings: { span: 0.3, kind: 'bug', col: '#e8f0ff' }, glow: '#ff5a3a' },
    attack: { dmg: 1, reach: 0.9, cd: 1.1, windup: 0.15, kind: 'poison' },
    drops: [{ id: 'mel', min: 0, max: 1, chance: 0.25 }],
    spawn: [{ biomes: ['pantano', 'tropical', 'cerejeiras'], group: [5, 8], weight: 6, time: 'night' }],
    coins: 1,
  }),
  m({
    id: 'casco_guarda', name: () => t('mob.cascoGuarda', 'Casco-Guarda'), habitat: 'ground', hp: 30, speed: 1.0, run: 2.6, radius: 0.6, mech: 'shield', sense: 14,
    plan: { form: 'biped', body: [0.7, 0.9, 0.8], col: '#3a8aa0', shell: '#5ab0c8', head: { r: 0.26, col: '#4aa0b8', eye: 1.2, horns: 'stub', hornCol: '#fff4d0' }, legs: { n: 2, len: 0.35, w: 0.14 }, arms: { len: 0.45, w: 0.14 }, shield: '#ffd34a', glow: '#bff6ff' },
    attack: { dmg: 5, reach: 1.8, cd: 1.8, windup: 0.6 },
    drops: [{ id: 'casca', min: 2, max: 3 }, { id: 'barra_ferro', min: 0, max: 1, chance: 0.25 }],
    spawn: [{ biomes: ['caverna'], group: [1, 2], weight: 6, depth: [12, 80] }, { biomes: ['oceano', 'rio'], group: [1, 1], weight: 2, time: 'night' }],
    coins: 5,
  }),
  m({
    id: 'fantasmim', name: () => t('mob.fantasmim', 'Fantasmim'), habitat: 'air', hp: 14, speed: 1.8, run: 3.5, radius: 0.5, mech: 'phase', alt: [0.6, 1.4], sense: 20,
    plan: { form: 'ghost', body: [0.8, 1.0, 0.8], col: '#e8f0ff', head: { r: 0.3, eye: 1.5, blush: true }, glow: '#bfd8ff' },
    attack: { dmg: 3, reach: 1.3, cd: 1.6, windup: 0.5, kind: 'cold', effect: 'slow' },
    drops: [{ id: 'po_sombra', min: 1, max: 2 }],
    spawn: [{ biomes: ['outono', 'cogumelos', 'nevado', 'bosque'], group: [1, 2], weight: 7, time: 'night' }],
    coins: 3,
  }),
  m({
    id: 'pedrolho', name: () => t('mob.pedrolho', 'Pedrolho'), habitat: 'ground', hp: 34, speed: 0.9, run: 9, radius: 0.7, mech: 'charge', sense: 12,
    plan: { form: 'quad', body: [1.1, 0.9, 1.0], col: '#8a8a9a', pattern: 'spots', patCol: '#6a6a7a', head: { r: 0.3, col: '#9a9aaa', eye: 1.1, horns: 'stub', hornCol: '#c8c4d0' }, legs: { n: 4, len: 0.25, w: 0.22 }, spikes: '#7af0ff', glow: '#7af0ff' },
    attack: { dmg: 7, reach: 1.6, cd: 4, windup: 0.9, kind: 'blast' },
    drops: [{ id: 'pedra', min: 3, max: 6 }, { id: 'cristal', min: 0, max: 1, chance: 0.35 }],
    spawn: [{ biomes: ['montanha', 'cristal'], group: [1, 1], weight: 5, time: 'night' }, { biomes: ['caverna'], group: [1, 1], weight: 5, depth: [6, 80] }],
    coins: 5,
  }),
  m({
    id: 'espantalhao', name: () => t('mob.espantalhao', 'Espantalhão'), habitat: 'ground', hp: 20, speed: 1.2, run: 2.8, radius: 0.5, mech: 'blink', sense: 22,
    plan: { form: 'biped', body: [0.5, 1.0, 0.6], col: '#c8944a', pattern: 'patch', patCol: '#8a5a9a', head: { r: 0.32, col: '#ff8a2e', eye: 1.3, cap: '#5a3a2a' }, legs: { n: 2, len: 0.6, w: 0.1, col: '#8a6a3a' }, arms: { len: 0.6, w: 0.08, col: '#8a6a3a' }, glow: '#ffd34a' },
    attack: { dmg: 4, reach: 1.6, cd: 1.6, windup: 0.5 },
    drops: [{ id: 'fibra', min: 2, max: 4 }, { id: 'abobora', min: 0, max: 1, chance: 0.4 }],
    spawn: [{ biomes: ['outono'], group: [1, 1], weight: 6, time: 'night', minNight: 1 }],
    coins: 4,
  }),
  m({
    id: 'nevasquinho', name: () => t('mob.nevasquinho', 'Nevasquinho'), habitat: 'ground', hp: 12, speed: 1.4, run: 3, radius: 0.45, mech: 'freeze', sense: 20,
    plan: { form: 'blob', body: [0.8, 0.9, 0.8], col: '#f4f8ff', head: { r: 0.3, eye: 1.3, blush: true, horns: 'spike', hornCol: '#9ae8ff' }, glow: '#9ae8ff' },
    attack: { dmg: 3, reach: 12, cd: 2.2, windup: 0.5, kind: 'cold', effect: 'gelo', proj: { speed: 13, col: '#ffffff', r: 0.25, arc: true } },
    drops: [{ id: 'neve', min: 2, max: 4 }, { id: 'gelo_eterno', min: 0, max: 1, chance: 0.25 }],
    spawn: [{ biomes: ['nevado', 'cristal'], group: [1, 3], weight: 8, time: 'night' }],
    coins: 3,
  }),
  m({
    id: 'fungo_bufa', name: () => t('mob.fungoBufa', 'Fungo-Bufa'), habitat: 'ground', hp: 12, speed: 0.9, run: 2.2, radius: 0.5, mech: 'spores', hops: true, sense: 10,
    plan: { form: 'biped', body: [0.6, 0.55, 0.6], col: '#fff0dc', head: { r: 0.42, cap: '#a07aff', eye: 1.1, blush: true }, legs: { n: 2, len: 0.12, w: 0.1 }, glow: '#9affe0' },
    attack: { dmg: 2, reach: 3.2, cd: 4, windup: 0.9, kind: 'poison', effect: 'sono' },
    drops: [{ id: 'cogumelo', min: 1, max: 3 }, { id: 'po_brilho', min: 0, max: 1 }],
    spawn: [{ biomes: ['cogumelos'], group: [1, 3], weight: 10 }, { biomes: ['caverna'], group: [1, 2], weight: 3, depth: [4, 40] }],
    coins: 2,
  }),
  m({
    id: 'lanterninha', name: () => t('mob.lanterninha', 'Lanterninha'), habitat: 'air', hp: 6, speed: 2, run: 5, radius: 0.25, mech: 'shy', alt: [1, 2.5], sense: 18,
    plan: { form: 'ghost', body: [0.4, 0.5, 0.4], col: '#3a2a5a', head: { r: 0.18, eye: 1.6 }, glow: '#ffb02e' },
    attack: { dmg: 2, reach: 1.0, cd: 1.0, windup: 0.25, kind: 'cold' },
    drops: [{ id: 'po_sombra', min: 1, max: 1 }, { id: 'po_brilho', min: 0, max: 1 }],
    spawn: [{ biomes: ['caverna'], group: [3, 6], weight: 7, depth: [20, 120] }],
    coins: 1,
  }),
  m({
    id: 'cristalarana', name: () => t('mob.cristalarana', 'Cristalaranha'), habitat: 'ground', hp: 18, speed: 1.6, run: 4.5, radius: 0.6, mech: 'web', climb: true, sense: 16,
    plan: { form: 'bug', body: [0.8, 0.5, 0.7], col: '#6a5ab0', pattern: 'spots', patCol: '#bff6ff', head: { r: 0.22, eye: 1.4, antennae: '#bff6ff' }, legs: { n: 8, len: 0.55, w: 0.06, col: '#4a3a8a' }, spikes: '#bff6ff', glow: '#bff6ff' },
    attack: { dmg: 3, reach: 10, cd: 3, windup: 0.6, effect: 'teia', proj: { speed: 14, col: '#f4f8ff', r: 0.2 } },
    drops: [{ id: 'seda', min: 1, max: 3 }, { id: 'cristal', min: 0, max: 1, chance: 0.4 }],
    spawn: [{ biomes: ['caverna'], group: [1, 2], weight: 6, depth: [15, 100] }, { biomes: ['cristal'], group: [1, 1], weight: 4, time: 'night' }],
    coins: 4,
  }),
  m({
    id: 'escorpinho', name: () => t('mob.escorpinho', 'Escorpinho'), habitat: 'ground', hp: 16, speed: 1.6, run: 4.2, radius: 0.5, mech: 'melee', sense: 14,
    plan: { form: 'bug', body: [0.7, 0.3, 0.5], col: '#e8a040', shell: '#d0882a', head: { r: 0.14, eye: 1.4 }, legs: { n: 6, len: 0.22, w: 0.05 }, claws: '#e8a040', tail: { kind: 'stinger', len: 1.0 }, glow: '#ff5af0' },
    attack: { dmg: 4, reach: 1.6, cd: 1.5, windup: 0.45, kind: 'poison', effect: 'slow' },
    drops: [{ id: 'casca', min: 1, max: 2 }, { id: 'espinho', min: 0, max: 1 }],
    spawn: [{ biomes: ['deserto'], group: [1, 2], weight: 8, time: 'night' }],
    coins: 3,
  }),
  m({
    id: 'espiadinha', name: () => t('mob.espiadinha', 'Espiadinha'), habitat: 'ground', hp: 20, speed: 0, run: 7, radius: 0.5, mech: 'stalk', sense: 30,
    plan: { form: 'ghost', body: [0.7, 1.4, 0.7], col: '#2a1a3a', head: { r: 0.3, eye: 1.8 }, glow: '#ff5af0' },
    attack: { dmg: 6, reach: 1.4, cd: 2, windup: 0.3, kind: 'cold' },
    drops: [{ id: 'po_sombra', min: 2, max: 3 }, { id: 'gema', min: 0, max: 1, chance: 0.1 }],
    spawn: [{ biomes: ['bosque', 'outono', 'cogumelos', 'nevado'], group: [1, 1], weight: 3, time: 'night', minNight: 3 }, { biomes: ['caverna'], group: [1, 1], weight: 2, depth: [30, 120] }],
    coins: 6,
  }),
  m({
    id: 'girinao', name: () => t('mob.girinao', 'Girinão'), habitat: 'water', hp: 5, speed: 2, run: 4.5, radius: 0.35, mech: 'swarm', sense: 16,
    plan: { form: 'fish', body: [0.6, 0.4, 0.4], col: '#4a6a3a', belly: '#c8e07a', head: { r: 0.2, eye: 1.6 }, tail: { kind: 'fin', len: 0.4 }, glow: '#e0ff7a' },
    attack: { dmg: 2, reach: 1.1, cd: 1.2, windup: 0.25, kind: 'poison' },
    drops: [{ id: 'gosma', min: 0, max: 1 }],
    spawn: [{ biomes: ['pantano'], group: [3, 5], weight: 4, time: 'night' }],
    coins: 1,
  }),
  /* minions dos chefes (também aparecem raramente no mundo) */
  m({
    id: 'brasinha', name: () => t('mob.brasinha', 'Brasinha'), habitat: 'air', hp: 6, speed: 3, run: 6, radius: 0.3, mech: 'swarm', alt: [1, 3], sense: 24,
    plan: { form: 'ghost', body: [0.45, 0.5, 0.45], col: '#ff8a2e', head: { r: 0.2, eye: 1.4, crest: '#ffd34a' }, glow: '#ffd34a' },
    attack: { dmg: 2, reach: 1.1, cd: 1.2, windup: 0.2, kind: 'fire', effect: 'queimando' },
    drops: [{ id: 'brasa', min: 1, max: 1 }],
    spawn: [{ biomes: ['montanha', 'deserto'], group: [2, 4], weight: 1, time: 'night', minNight: 5 }],
    coins: 1,
  }),
  m({
    id: 'pedrisco', name: () => t('mob.pedrisco', 'Pedrisco'), habitat: 'ground', hp: 10, speed: 2, run: 4.5, radius: 0.35, mech: 'melee', sense: 24,
    plan: { form: 'bug', body: [0.6, 0.4, 0.6], col: '#7a7a8a', shell: '#9a9aaa', head: { r: 0.14, eye: 1.5 }, legs: { n: 6, len: 0.22, w: 0.06, col: '#5a5a6a' }, spikes: '#ff7ab0', glow: '#ff7ab0' },
    attack: { dmg: 3, reach: 1.2, cd: 1.3, windup: 0.35 },
    drops: [{ id: 'pedra', min: 1, max: 2 }, { id: 'quartzo', min: 0, max: 1, chance: 0.3 }],
    spawn: [{ biomes: ['caverna'], group: [2, 3], weight: 3, depth: [30, 120] }],
    coins: 1,
  }),
];
