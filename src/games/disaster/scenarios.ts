/* ============================================================
 *  SOBREVIVA AOS DESASTRES — mapas, desastres e os 100 cenários.
 *  Tudo determinístico pela semente: o cenário #N é sempre igual.
 * ============================================================ */
import { t } from '../../i18n';

export type MapId =
  | 'vila'
  | 'praia'
  | 'cidade'
  | 'floresta'
  | 'ilha'
  | 'montanha'
  | 'parque'
  | 'porto'
  | 'deserto'
  | 'estacao'
  | 'polo'
  | 'fazenda';

export type DisasterId =
  | 'tsunami'
  | 'vulcao'
  | 'terremoto'
  | 'tornado'
  | 'meteoros'
  | 'enchente'
  | 'avalanche'
  | 'raios'
  | 'acido'
  | 'meteoro'
  | 'sumidouro'
  | 'areia';

export type ModId = 'none' | 'noite' | 'vento' | 'rapido' | 'dupla';

export interface MapTheme {
  id: MapId;
  name: () => string;
  sky: [string, string, string];
  far: string; // silhueta distante
  mid: string; // silhueta média
  ground: string;
  groundTop: string;
  /** formato da silhueta de fundo */
  farKind: 'hills' | 'peaks' | 'city' | 'dunes' | 'sea' | 'pines' | 'domes';
  /** pesos de construção: casas, torres, árvores, plataformas soltas, caixas */
  houses: number;
  towers: number;
  trees: number;
  floats: number;
  crates: number;
  wall: string[];
  roof: string[];
  leaf: string;
  trunk: string;
}

const M = (m: MapTheme) => m;

export const MAPS: MapTheme[] = [
  M({ id: 'vila', name: () => t('dz.map.vila', 'Vila'), sky: ['#7cc8ff', '#b8e4ff', '#e9f7ff'], far: '#9cc7e8', mid: '#7fbf7a', ground: '#7a5233', groundTop: '#59c35a', farKind: 'hills', houses: 5, towers: 1, trees: 4, floats: 2, crates: 4, wall: ['#ffd9a8', '#ffe9c9', '#f6c9e4', '#cfe8ff'], roof: ['#e2574c', '#d9822b', '#9b5de5'], leaf: '#3fb54f', trunk: '#8a5a33' }),
  M({ id: 'praia', name: () => t('dz.map.praia', 'Praia'), sky: ['#4fc3ff', '#9fe3ff', '#fff3d6'], far: '#5ac8e8', mid: '#f5d58a', ground: '#d9a75a', groundTop: '#ffe39a', farKind: 'sea', houses: 3, towers: 2, trees: 4, floats: 3, crates: 3, wall: ['#fff3e0', '#c9f3ff', '#ffd6e0'], roof: ['#ff7a59', '#3ab0c9', '#ffb03a'], leaf: '#35c46a', trunk: '#b07a43' }),
  M({ id: 'cidade', name: () => t('dz.map.cidade', 'Cidade'), sky: ['#6aa9ff', '#a9cbff', '#e3eeff'], far: '#8fa7d6', mid: '#6f86b8', ground: '#5b5f6e', groundTop: '#8b90a3', farKind: 'city', houses: 2, towers: 4, trees: 1, floats: 3, crates: 3, wall: ['#d9dde8', '#f2e2c9', '#c9d8f2', '#f0c9c9'], roof: ['#56607a', '#3e4a66'], leaf: '#3fa34f', trunk: '#7a5233' }),
  M({ id: 'floresta', name: () => t('dz.map.floresta', 'Floresta'), sky: ['#8fd3c2', '#c4ecd9', '#effbe9'], far: '#7fb79c', mid: '#3f8f5c', ground: '#5e3d22', groundTop: '#3e9a43', farKind: 'pines', houses: 2, towers: 1, trees: 8, floats: 3, crates: 2, wall: ['#c9925a', '#b47b45'], roof: ['#6b3e1f', '#3e7a3b'], leaf: '#2f9e44', trunk: '#6b4423' }),
  M({ id: 'ilha', name: () => t('dz.map.ilha', 'Ilha'), sky: ['#39b8ff', '#8fe0ff', '#f2fff6'], far: '#47b9d9', mid: '#59d07a', ground: '#c99a5b', groundTop: '#68d05b', farKind: 'sea', houses: 3, towers: 1, trees: 6, floats: 3, crates: 2, wall: ['#f7e1b5', '#ffe9d9'], roof: ['#d9a648', '#c9773a'], leaf: '#2fbf5a', trunk: '#a8743f' }),
  M({ id: 'montanha', name: () => t('dz.map.montanha', 'Montanha'), sky: ['#7fb2ff', '#c7dcff', '#f4f8ff'], far: '#a9b9dc', mid: '#7c8fb3', ground: '#6b6070', groundTop: '#e8f1ff', farKind: 'peaks', houses: 3, towers: 2, trees: 4, floats: 4, crates: 2, wall: ['#b8865a', '#d9a874'], roof: ['#7a3e2a', '#a14d3a'], leaf: '#2e8b57', trunk: '#6b4423' }),
  M({ id: 'parque', name: () => t('dz.map.parque', 'Parque de Diversões'), sky: ['#ff9ecf', '#ffd0e8', '#fff3fb'], far: '#e6a3d6', mid: '#9ad97f', ground: '#7a5233', groundTop: '#6fd06a', farKind: 'domes', houses: 3, towers: 3, trees: 2, floats: 4, crates: 3, wall: ['#ff8fb1', '#8fd3ff', '#ffe066', '#b69cff'], roof: ['#ff4f8b', '#3f8cff', '#ffb000'], leaf: '#3fb54f', trunk: '#8a5a33' }),
  M({ id: 'porto', name: () => t('dz.map.porto', 'Porto'), sky: ['#5aa7e6', '#a3d1f2', '#e8f4fb'], far: '#6fa8cc', mid: '#5c7c9c', ground: '#5a4a3c', groundTop: '#9c8a74', farKind: 'sea', houses: 2, towers: 3, trees: 1, floats: 3, crates: 6, wall: ['#e85d4f', '#3f8cff', '#ffc93f', '#4fc36f'], roof: ['#4a5568', '#2f3a4f'], leaf: '#3fa34f', trunk: '#7a5233' }),
  M({ id: 'deserto', name: () => t('dz.map.deserto', 'Deserto'), sky: ['#ffb36b', '#ffd9a1', '#fff4dc'], far: '#f0b77a', mid: '#e0a060', ground: '#c98a4a', groundTop: '#f2c27a', farKind: 'dunes', houses: 4, towers: 2, trees: 2, floats: 2, crates: 3, wall: ['#f2d3a0', '#e9c08a'], roof: ['#d98a4a', '#c9773a'], leaf: '#5bb04a', trunk: '#8a6a3a' }),
  M({ id: 'estacao', name: () => t('dz.map.estacao', 'Estação Espacial'), sky: ['#1b1446', '#3a2a7a', '#6a4fb3'], far: '#4a3a8f', mid: '#2e2466', ground: '#4f5878', groundTop: '#9aa8d6', farKind: 'domes', houses: 2, towers: 3, trees: 0, floats: 5, crates: 3, wall: ['#d6def5', '#b8c4ee', '#e6f0ff'], roof: ['#7b8ccf', '#5ac8ff'], leaf: '#5ac8ff', trunk: '#6a7aa8' }),
  M({ id: 'polo', name: () => t('dz.map.polo', 'Polo Gelado'), sky: ['#8fd0ff', '#cdeaff', '#ffffff'], far: '#cfe3f7', mid: '#a9cbe8', ground: '#7fa3c4', groundTop: '#ffffff', farKind: 'peaks', houses: 3, towers: 1, trees: 3, floats: 3, crates: 2, wall: ['#e8f4ff', '#cfe8ff'], roof: ['#5a8fd6', '#e2574c'], leaf: '#2e8b6f', trunk: '#6b4423' }),
  M({ id: 'fazenda', name: () => t('dz.map.fazenda', 'Fazenda'), sky: ['#7cc8ff', '#c2e6ff', '#fff8e1'], far: '#a7d18a', mid: '#8cc46a', ground: '#7a5233', groundTop: '#8fd35a', farKind: 'hills', houses: 4, towers: 1, trees: 3, floats: 2, crates: 5, wall: ['#e2574c', '#ffe9c9', '#f2d3a0'], roof: ['#8a3a2a', '#ffffff', '#5a4a3c'], leaf: '#3fb54f', trunk: '#8a5a33' }),
];

export interface DisasterInfo {
  id: DisasterId;
  name: () => string;
  hint: () => string;
  color: string;
}

export const DISASTERS: Record<DisasterId, DisasterInfo> = {
  tsunami: { id: 'tsunami', name: () => t('dz.d.tsunami', 'Tsunami'), hint: () => t('dz.h2.tsunami', 'Ondas cada vez maiores! Suba e troque de lugar entre elas.'), color: '#2f8cff' },
  vulcao: { id: 'vulcao', name: () => t('dz.d.vulcao', 'Vulcão'), hint: () => t('dz.h2.vulcao', 'A lava desce da direita e bolas de fogo caem. Fuja das sombras!'), color: '#ff5a1f' },
  terremoto: { id: 'terremoto', name: () => t('dz.d.terremoto', 'Terremoto'), hint: () => t('dz.h2.terremoto', 'O chão vai rachar! Fuja das rachaduras e das sombras.'), color: '#b07a43' },
  tornado: { id: 'tornado', name: () => t('dz.d.tornado', 'Tornado'), hint: () => t('dz.h2.tornado', 'Abrigue-se numa casa, mas o tornado arranca telhados. Fique longe dele!'), color: '#8a94b8' },
  meteoros: { id: 'meteoros', name: () => t('dz.d.meteoros', 'Chuva de Meteoros'), hint: () => t('dz.h2.meteoros', 'Não pare! Os meteoros miram onde você vai estar.'), color: '#ff7a2e' },
  enchente: { id: 'enchente', name: () => t('dz.d.enchente', 'Enchente'), hint: () => t('dz.h2.enchente', 'A água sobe em etapas. Suba aos poucos e nade se precisar!'), color: '#3fa0e0' },
  avalanche: { id: 'avalanche', name: () => t('dz.d.avalanche', 'Avalanche'), hint: () => t('dz.h2.avalanche', 'Avalanches da direita e bolas de neve rolando. Suba e pule!'), color: '#e6f2ff' },
  raios: { id: 'raios', name: () => t('dz.d.raios', 'Tempestade de Raios'), hint: () => t('dz.h2.raios', 'Os raios caem no mais alto! Fique baixo, mas fora da água.'), color: '#ffe14d' },
  acido: { id: 'acido', name: () => t('dz.d.acido', 'Gosma Verde'), hint: () => t('dz.h2.acido', 'A gosma sobe e derrete as torres. Pule de uma para outra!'), color: '#6aff3f' },
  meteoro: { id: 'meteoro', name: () => t('dz.d.meteoro', 'Meteoro Gigante'), hint: () => t('dz.h.meteoro', 'Corra até o bunker antes do impacto!'), color: '#ff3f6a' },
  sumidouro: { id: 'sumidouro', name: () => t('dz.d.sumidouro', 'Sumidouro'), hint: () => t('dz.h.sumidouro', 'O chão afunda onde aparecem rachaduras. Vá para o chão firme!'), color: '#8a5a33' },
  areia: { id: 'areia', name: () => t('dz.d.areia', 'Tempestade de Areia'), hint: () => t('dz.h.areia', 'Rajadas e destroços voando! Entre numa casa ou pule os destroços.'), color: '#e0a060' },
};

export const MOD_NAMES: Record<ModId, () => string> = {
  none: () => '',
  noite: () => t('dz.m.noite', 'Noite'),
  vento: () => t('dz.m.vento', 'Ventania'),
  rapido: () => t('dz.m.rapido', 'Turbo'),
  dupla: () => t('dz.m.dupla', 'Combo'),
};

export interface Scenario {
  n: number; // 1..100
  seed: number;
  map: MapTheme;
  disasters: DisasterId[]; // 1 ou 2 (combo)
  mod: ModId;
  difficulty: number; // 1..5
}

/* ----------------------------- RNG ----------------------------- */

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** desastres que combinam com cada mapa (o primeiro é o "clássico") */
export const FIT: Record<MapId, DisasterId[]> = {
  vila: ['tsunami', 'terremoto', 'tornado', 'meteoros', 'enchente', 'raios'],
  praia: ['tsunami', 'enchente', 'raios', 'meteoros', 'acido', 'areia'],
  cidade: ['terremoto', 'tornado', 'meteoros', 'acido', 'raios', 'enchente', 'sumidouro'],
  floresta: ['raios', 'enchente', 'tornado', 'acido', 'vulcao'],
  ilha: ['vulcao', 'tsunami', 'meteoros', 'raios'],
  montanha: ['avalanche', 'vulcao', 'terremoto', 'raios'],
  parque: ['tornado', 'meteoros', 'acido', 'terremoto', 'raios', 'sumidouro'],
  porto: ['tsunami', 'tornado', 'enchente', 'terremoto'],
  deserto: ['areia', 'meteoros', 'tornado', 'sumidouro', 'terremoto', 'acido', 'vulcao'],
  estacao: ['meteoros', 'acido', 'terremoto', 'raios'],
  polo: ['avalanche', 'meteoros', 'tsunami', 'terremoto'],
  fazenda: ['tornado', 'enchente', 'raios', 'areia', 'terremoto', 'vulcao', 'sumidouro'],
};

let cache: Scenario[] | null = null;

export function scenarios(): Scenario[] {
  if (cache) return cache;
  const out: Scenario[] = [];
  const r = mulberry(20261109);
  for (let i = 0; i < 100; i++) {
    const n = i + 1;
    const map = MAPS[(i * 7 + Math.floor(i / 12)) % MAPS.length];
    const difficulty = Math.min(5, 1 + Math.floor(i / 20) + (r() < 0.25 ? 1 : 0));
    if (n % 10 === 0) {
      out.push({ n, seed: 1000 + n * 77, map, disasters: ['meteoro'], mod: n >= 50 && r() < 0.5 ? 'noite' : 'none', difficulty });
      continue;
    }
    const fit = FIT[map.id];
    const d1 = i < 12 ? fit[0] : fit[Math.floor(r() * fit.length)];
    let mod: ModId = 'none';
    const roll = r();
    if (i >= 6) {
      if (roll < 0.14) mod = 'noite';
      else if (roll < 0.24) mod = 'vento';
      else if (roll < 0.34 && i >= 15) mod = 'rapido';
      else if (roll < 0.5 && i >= 20) mod = 'dupla';
    }
    const disasters: DisasterId[] = [d1];
    if (mod === 'dupla') {
      // segundo desastre de "outra família" (fluido + golpe), para caber junto
      const fluid = (d: DisasterId) => d === 'tsunami' || d === 'enchente' || d === 'acido' || d === 'avalanche' || d === 'vulcao';
      const pool = fit.filter((d) => d !== d1 && fluid(d) !== fluid(d1));
      if (pool.length) disasters.push(pool[Math.floor(r() * pool.length)]);
      else mod = 'none';
    }
    out.push({ n, seed: 1000 + n * 77, map, disasters, mod, difficulty });
  }
  cache = out;
  return out;
}

export function scenarioName(s: Scenario): string {
  const d = s.disasters.map((x) => DISASTERS[x].name()).join(' + ');
  const m = s.mod !== 'none' && s.mod !== 'dupla' ? ` (${MOD_NAMES[s.mod]()})` : '';
  return `${s.map.name()} + ${d}${m}`;
}

/** Dica no 3D: lá a lava e a avalanche sobem em ondas (não vêm "da direita" como no 2D). */
export function hint3d(d: DisasterId): string {
  if (d === 'vulcao') return t('dz.h3.vulcao', 'A lava sobe em ondas e bolas de fogo caem. Suba alto e fuja das sombras!');
  if (d === 'avalanche') return t('dz.h3.avalanche', 'A neve sobe em ondas e bolas de neve rolam. Suba alto e pule!');
  return DISASTERS[d].hint();
}
