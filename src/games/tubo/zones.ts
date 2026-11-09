/**
 * Queda Giratória — paletas das zonas (a cada ZONE_LEN anéis o cenário muda).
 * Tudo em tons quentes/doces, bem diferente do espaço do Bloop Orbit.
 */
import { t } from '../../i18n';

export interface Zone {
  key: string;
  name: () => string;
  /** fundo: topo, meio, base */
  bg: [string, string, string];
  /** anel seguro: topo claro, topo escuro (borda), lateral clara, lateral escura */
  ring: [string, string, string, string];
  /** cano: luz, meio, sombra */
  pipe: [string, string, string];
  /** cor das nuvens/bolhas do fundo */
  cloud: string;
  /** brilho/partículas */
  accent: string;
}

export const ZONE_LEN = 12;

export const ZONES: Zone[] = [
  {
    key: 'caramel',
    name: () => t('tubo.zone.caramel', 'Pôr do Sol de Caramelo'),
    bg: ['#ffcf8a', '#ff9f80', '#ff6f91'],
    ring: ['#fff1c2', '#ffc76a', '#ffb44d', '#e27f2a'],
    pipe: ['#fffaf0', '#ffe2c4', '#e9a882'],
    cloud: '#fff4e6',
    accent: '#ffd36b',
  },
  {
    key: 'mint',
    name: () => t('tubo.zone.mint', 'Lagoa de Hortelã'),
    bg: ['#b9f5dc', '#6fd3c4', '#3a8fb7'],
    ring: ['#f0ffd9', '#b5ec8a', '#8fd86a', '#4fa34a'],
    pipe: ['#ffffff', '#dff7f1', '#8fc9c4'],
    cloud: '#eafff8',
    accent: '#b5ffe0',
  },
  {
    key: 'grape',
    name: () => t('tubo.zone.grape', 'Nuvem de Uva'),
    bg: ['#f1c6ff', '#b38cff', '#6a4bd8'],
    ring: ['#ffe9fa', '#ffb8e6', '#f58fd0', '#c25aa6'],
    pipe: ['#fffaff', '#eedcff', '#b49ad8'],
    cloud: '#fbefff',
    accent: '#ffc8f0',
  },
  {
    key: 'peach',
    name: () => t('tubo.zone.peach', 'Pêssego ao Anoitecer'),
    bg: ['#ffc2a1', '#e9779a', '#5b2a86'],
    ring: ['#fff3e3', '#ffcfa1', '#ffad7a', '#d06a4a'],
    pipe: ['#fff8f2', '#ffdcd0', '#c890a8'],
    cloud: '#ffe7ef',
    accent: '#ffb38a',
  },
  {
    key: 'lemon',
    name: () => t('tubo.zone.lemon', 'Limonada Gelada'),
    bg: ['#fffbb0', '#bdf0a0', '#4fc3c3'],
    ring: ['#ffffff', '#fff27a', '#ffe14a', '#d6a915'],
    pipe: ['#ffffff', '#eafff6', '#9fd6c4'],
    cloud: '#ffffff',
    accent: '#fff6a0',
  },
];

/** vermelho perigoso (igual em todas as zonas) + listras para quem não distingue cores */
export const RED = { top: '#ff5a6e', topDark: '#d92846', stripe: '#b8143a', side: '#e8344f', sideDark: '#9e1030' };

export const zoneAt = (ringIdx: number): number => Math.floor(Math.max(0, ringIdx) / ZONE_LEN) % ZONES.length;
