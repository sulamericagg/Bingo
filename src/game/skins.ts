/* ============================================================
 *  CATÁLOGO DE COSMÉTICOS — skins + rastros
 *  Tudo é desenhado proceduralmente (ver character.ts / trails.ts).
 * ============================================================ */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type Accessory =
  | 'none' | 'antenna' | 'leaf' | 'horns' | 'cat' | 'crown' | 'halo' | 'helmet' | 'headband' | 'robot' | 'bow' | 'flame'
  | 'bee' | 'chef' | 'astro' | 'pirate' | 'headphones' | 'zombie' | 'capy' | 'soccer' | 'wizard' | 'unicorn' | 'samurai'
  | 'stem' | 'snowhat' | 'cloud' | 'dragon' | 'cyber' | 'crystals' | 'rocks' | 'phoenix' | 'wisps' | 'laurel';

export type Pattern =
  | 'none' | 'spots' | 'stripes' | 'galaxy' | 'shine' | 'ghost'
  | 'bee' | 'patches' | 'jersey' | 'pumpkin' | 'snow' | 'sparkle' | 'scales'
  // animados (épico+)
  | 'rainbow' | 'holo' | 'circuit' | 'crystal' | 'lava' | 'ember' | 'void' | 'gold';

/** Estilo do rosto. Padrão: 'cute'. */
export type Face = 'cute' | 'robot' | 'visor' | 'glow' | 'pumpkin' | 'zombie' | 'coal' | 'patch' | 'mustache' | 'snout';

export interface Price {
  coins?: number;
  gems?: number;
  ads?: number;
  /** id do produto na loja (compra com dinheiro real) */
  iap?: string;
  /** Item exclusivo de evento: NÃO pode ser comprado (só código promocional / presente do admin). Ex.: 'challenge'. */
  event?: string;
}

export interface Skin {
  id: string;
  name: string;
  light: string;
  dark: string;
  belly: string;
  /** cor da pupila (ou do brilho dos olhos em rostos 'glow'/'robot'/'visor') */
  eye: string;
  accessory: Accessory;
  accent: string;
  pattern: Pattern;
  price: Price;
  rarity: Rarity;
  /** cor da íris (gradiente) — padrão: derivada de `dark` */
  iris?: string;
  /** segunda cor de detalhe */
  accent2?: string;
  face?: Face;
  /** cor da luz de borda (rim light) */
  rim?: string;
  /** item sazonal (a UI pode destacar) */
  season?: 'halloween' | 'natal' | 'carnaval' | 'copa';
  /** frase curta pt-BR para a loja */
  desc?: string;
}

export const SKINS: Skin[] = [
  /* ---------------- COMUM ---------------- */
  { id: 'bloop', name: 'Bloop', light: '#ff8fd8', dark: '#b63fd6', belly: '#ffd2f1', eye: '#2a1140', accessory: 'antenna', accent: '#fff36b', pattern: 'none', price: {}, rarity: 'common', desc: 'O original. Fofo e saltitante.' },
  /* personagem montado no "Crie seu Bloop" (desenhado por avatar.ts; cores/raridade sincronizadas lá) */
  { id: 'custom', name: 'Meu Bloop', light: '#c9a3a3', dark: '#8a6a6a', belly: '#e8d0d0', eye: '#231d1a', accessory: 'none', accent: '#a8b08f', pattern: 'none', price: {}, rarity: 'common', desc: 'Criado por você, peça por peça.' },
  { id: 'mint', name: 'Hortelã', light: '#9dffcb', dark: '#19b67f', belly: '#e1ffef', eye: '#0d3527', accessory: 'leaf', accent: '#3fe06c', pattern: 'spots', price: { coins: 250 }, rarity: 'common', desc: 'Fresquinho como uma folha.' },
  { id: 'sunny', name: 'Solzinho', light: '#fff38a', dark: '#ffaa1c', belly: '#fffbe0', eye: '#4a2a00', iris: '#c06a00', accessory: 'bow', accent: '#ff5d8f', pattern: 'none', price: { coins: 450 }, rarity: 'common', desc: 'Sempre de bom humor.' },
  { id: 'chef', name: 'Chef Bloop', light: '#ffe9dc', dark: '#e59f86', belly: '#ffffff', eye: '#3a1a10', iris: '#8a4a2a', accessory: 'chef', accent: '#ff4d4d', pattern: 'none', face: 'mustache', price: { ads: 3 }, rarity: 'common', desc: 'Cozinha órbitas al dente.' },
  { id: 'bee', name: 'Abelhinha', light: '#ffe45c', dark: '#f0a000', belly: '#fff6c9', eye: '#2a1a00', iris: '#a86400', accessory: 'bee', accent: '#2e2010', pattern: 'bee', price: { coins: 800 }, rarity: 'common', desc: 'Zum-zum de planeta em planeta.' },

  /* ---------------- RARO ---------------- */
  { id: 'ocean', name: 'Oceano', light: '#8fe9ff', dark: '#2a6dff', belly: '#dff8ff', eye: '#081a45', accessory: 'helmet', accent: '#bff3ff', pattern: 'spots', price: { coins: 700 }, rarity: 'rare', desc: 'Mergulhador das estrelas.' },
  { id: 'kitty', name: 'Gatinho', light: '#ffc58f', dark: '#f0702a', belly: '#fff0e0', eye: '#3a1800', iris: '#3fae4a', accessory: 'cat', accent: '#ff9bb3', pattern: 'stripes', price: { coins: 1000 }, rarity: 'rare', desc: 'Sete vidas? Melhor não testar.' },
  { id: 'zombie', name: 'Zumbizinho', light: '#bdea8a', dark: '#5f9440', belly: '#dcf5c4', eye: '#2a1030', iris: '#9b3dff', accessory: 'zombie', accent: '#f4ead6', pattern: 'patches', face: 'zombie', price: { coins: 1200 }, rarity: 'rare', desc: 'Só quer um abraço (e cérebros?).' },
  { id: 'devil', name: 'Capetinha', light: '#ff7a7a', dark: '#c4123a', belly: '#ffd0d0', eye: '#2a0008', iris: '#ffb300', accessory: 'horns', accent: '#4a0613', pattern: 'none', price: { coins: 1500 }, rarity: 'rare', desc: 'Travesso, mas de bom coração.' },
  { id: 'astro', name: 'Astronauta', light: '#f6f8ff', dark: '#9aa7c7', belly: '#ffffff', eye: '#14204a', iris: '#3f7bff', accessory: 'astro', accent: '#ff7a2f', pattern: 'none', price: { coins: 1800 }, rarity: 'rare', desc: 'Um pequeno pulo para um Bloop.' },
  { id: 'dj', name: 'DJ Batida', light: '#7cf5e0', dark: '#1b8f9e', belly: '#d9fff8', eye: '#06222a', iris: '#ff3dd2', accessory: 'headphones', accent: '#ff3dd2', accent2: '#2a2f45', pattern: 'none', price: { coins: 2200 }, rarity: 'rare', desc: 'Solta o grave na galáxia!' },
  { id: 'angel', name: 'Anjinho', light: '#ffffff', dark: '#b7c8ff', belly: '#ffffff', eye: '#283070', iris: '#6a8cff', accessory: 'halo', accent: '#ffe35c', pattern: 'shine', price: { ads: 5 }, rarity: 'rare', desc: 'Puro como nuvem de algodão.' },
  { id: 'capy', name: 'Capivarinha', light: '#d9a874', dark: '#8a5a32', belly: '#f0d4b0', eye: '#2a1600', iris: '#6a3a10', accessory: 'capy', accent: '#ff9a1f', pattern: 'none', face: 'snout', price: { ads: 4 }, rarity: 'rare', desc: 'Tranquilona. Nada a abala.' },
  { id: 'pirate', name: 'Pirata', light: '#ffcf9e', dark: '#d9824a', belly: '#fff0dc', eye: '#2a1200', iris: '#2f7bff', accessory: 'pirate', accent: '#e23b3b', accent2: '#2a1e2e', pattern: 'none', face: 'patch', price: { ads: 6 }, rarity: 'rare', desc: 'Caçador de tesouros cósmicos.' },

  /* ---------------- ÉPICO ---------------- */
  { id: 'ghost', name: 'Fantasminha', light: '#f1f6ff', dark: '#8f9dd8', belly: '#ffffff', eye: '#1b1f3d', iris: '#5a6cd8', accessory: 'none', accent: '#9fd8ff', pattern: 'ghost', price: { coins: 2200 }, rarity: 'epic', desc: 'Buuu! (de carinho)' },
  { id: 'snowman', name: 'Bonequinho de Neve', light: '#ffffff', dark: '#a9c8ec', belly: '#ffffff', eye: '#1a1a24', accessory: 'snowhat', accent: '#e8263b', accent2: '#2a2a38', pattern: 'snow', face: 'coal', season: 'natal', price: { coins: 3000 }, rarity: 'epic', desc: 'Edição de Natal. Derrete corações.' },
  { id: 'unicorn', name: 'Unicórnio', light: '#ffffff', dark: '#e2c8ff', belly: '#fff7fd', eye: '#3a1a5c', iris: '#ff6bd5', accessory: 'unicorn', accent: '#ffd76b', pattern: 'sparkle', rim: '#ff9bf0', price: { coins: 4500 }, rarity: 'epic', desc: 'Brilha mais que purpurina.' },
  { id: 'pumpkin', name: 'Abóbora', light: '#ff9a2e', dark: '#c4400a', belly: '#ffcf86', eye: '#ffe14a', accessory: 'stem', accent: '#3f8f2a', pattern: 'pumpkin', face: 'pumpkin', season: 'halloween', price: { gems: 30 }, rarity: 'epic', desc: 'Edição de Halloween. Doce ou travessura!' },
  { id: 'ninja', name: 'Ninja', light: '#5d6b8a', dark: '#1a1f33', belly: '#c9d3ea', eye: '#ffffff', iris: '#8fa3c8', accessory: 'headband', accent: '#ff3b5c', pattern: 'none', rim: '#8fb4ff', price: { gems: 40 }, rarity: 'epic', desc: 'Silencioso entre as estrelas.' },
  { id: 'wizard', name: 'Magozinho', light: '#a796ff', dark: '#4b2fb8', belly: '#ddd5ff', eye: '#160a40', iris: '#3fd9ff', accessory: 'wizard', accent: '#ffd84a', accent2: '#2b1a7a', pattern: 'none', price: { gems: 60 }, rarity: 'epic', desc: 'Abracadabra, órbita perfeita!' },
  { id: 'robot', name: 'Robô X', light: '#d9e6f2', dark: '#6d7f99', belly: '#9fb6cc', eye: '#00e5ff', accessory: 'robot', accent: '#00e5ff', pattern: 'shine', face: 'robot', price: { gems: 70 }, rarity: 'epic', desc: 'Bip-bup. Pouso calculado.' },
  { id: 'fire', name: 'Brasa', light: '#ffd36b', dark: '#ff3d00', belly: '#fff1c2', eye: '#3a0a00', iris: '#ff7a00', accessory: 'flame', accent: '#ffea00', pattern: 'none', price: { gems: 90 }, rarity: 'epic', desc: 'Quente demais pra parar.' },
  { id: 'samurai', name: 'Samurai', light: '#ffe2c8', dark: '#e0a37a', belly: '#fff3e6', eye: '#1a0a00', iris: '#7a3a10', accessory: 'samurai', accent: '#ffcc33', accent2: '#c4122f', pattern: 'none', price: { gems: 100 }, rarity: 'epic', desc: 'Honra em cada salto.' },
  { id: 'arcoiris', name: 'Arco-Íris', light: '#ffb3e6', dark: '#7a5cff', belly: '#ffffff', eye: '#2a1140', iris: '#ff4fa8', accessory: 'cloud', accent: '#ffffff', pattern: 'rainbow', price: { gems: 120 }, rarity: 'epic', desc: 'Todas as cores de uma vez.' },
  { id: 'craque', name: 'Craque', light: '#ffe94d', dark: '#f0b400', belly: '#fff7b0', eye: '#0a2a12', iris: '#1e9c48', accessory: 'soccer', accent: '#1fa64a', accent2: '#1f4fd1', pattern: 'jersey', season: 'copa', price: { ads: 8 }, rarity: 'epic', desc: 'Verde-amarelo, camisa 10 da galáxia!' },

  /* ---------------- LENDÁRIO ---------------- */
  { id: 'king', name: 'Rei Dourado', light: '#fff1a6', dark: '#d79a00', belly: '#fff8d6', eye: '#3d2600', iris: '#ff2e63', accessory: 'crown', accent: '#ff2e63', pattern: 'shine', price: { gems: 150 }, rarity: 'legendary', desc: 'Majestade do sistema solar.' },
  { id: 'crystal', name: 'Cristal', light: '#dcf6ff', dark: '#6b7dff', belly: '#f4fbff', eye: '#1a1a5c', iris: '#b84dff', accessory: 'crystals', accent: '#ff9bf5', pattern: 'crystal', rim: '#bff8ff', price: { gems: 180 }, rarity: 'legendary', desc: 'Lapidado nas minas de Netuno.' },
  { id: 'dragon', name: 'Dragãozinho', light: '#7dff9a', dark: '#119e5a', belly: '#fff3a6', eye: '#1a2a00', iris: '#ffb300', accessory: 'dragon', accent: '#ff9f43', accent2: '#0b6e3f', pattern: 'scales', price: { gems: 220 }, rarity: 'legendary', desc: 'Pequeno no tamanho, gigante no fogo.' },
  { id: 'cyber', name: 'Ciber Neon', light: '#454b80', dark: '#0d0f24', belly: '#5a5f9a', eye: '#00fff0', accessory: 'cyber', accent: '#00fff0', accent2: '#ff2bd6', pattern: 'circuit', face: 'visor', rim: '#ff2bd6', price: { gems: 300 }, rarity: 'legendary', desc: 'Conectado direto na rede estelar.' },
  { id: 'holo', name: 'Holográfico', light: '#eef0ff', dark: '#9aa2d8', belly: '#ffffff', eye: '#1a1440', iris: '#3fd9ff', accessory: 'antenna', accent: '#ff7af0', pattern: 'holo', rim: '#9ffcff', price: { coins: 6000 }, rarity: 'legendary', desc: 'Muda de cor a cada ângulo.' },
  { id: 'galaxy', name: 'Galáxia', light: '#7f6bff', dark: '#1a0b5c', belly: '#c7b8ff', eye: '#ffffff', iris: '#7dfcff', accessory: 'antenna', accent: '#7dfcff', pattern: 'galaxy', rim: '#ff7af0', price: { iap: 'starter_pack' }, rarity: 'legendary', desc: 'Um universo inteiro dentro de você.' },

  /* ---------------- MÍTICO (dinheiro real / evento) ---------------- */
  { id: 'phoenix', name: 'Fênix', light: '#ffe36b', dark: '#ff3d1f', belly: '#fff3c2', eye: '#3a0a00', iris: '#ff7a00', accessory: 'phoenix', accent: '#ffb300', accent2: '#ff3d00', pattern: 'ember', rim: '#fff3a0', price: { iap: 'skin_phoenix' }, rarity: 'mythic', desc: 'Renasce a cada partida.' },
  { id: 'lava', name: 'Golem de Lava', light: '#6a463e', dark: '#1e0f0e', belly: '#4a2c26', eye: '#ffb000', accessory: 'rocks', accent: '#ff6a00', accent2: '#ffd84a', pattern: 'lava', face: 'glow', rim: '#ff7a1a', price: { iap: 'skin_lava_golem' }, rarity: 'mythic', desc: 'Forjado no núcleo de um planeta.' },
  { id: 'shadow', name: 'Sombra', light: '#3a2f5c', dark: '#07050f', belly: '#2a2245', eye: '#d27bff', accessory: 'wisps', accent: '#b14dff', pattern: 'void', face: 'glow', rim: '#b14dff', price: { event: 'challenge' }, rarity: 'mythic', desc: 'Exclusivo de evento. Poucos têm.' },
  { id: 'campeao', name: 'Campeão', light: '#fff2a8', dark: '#c98a00', belly: '#fffbe0', eye: '#3d2600', iris: '#1fa64a', accessory: 'laurel', accent: '#1fa64a', pattern: 'gold', rim: '#fff7c2', price: { event: 'challenge' }, rarity: 'mythic', desc: 'Prêmio de desafio. Só para lendas.' },
];

/* ============================================================
 *  RASTROS
 * ============================================================ */

export type TrailKind =
  | 'spark' | 'bubbles' | 'fire' | 'stars' | 'hearts' | 'confetti' | 'rainbow' | 'lightning'
  | 'smoke' | 'petals' | 'notes' | 'pixels' | 'comet' | 'brasil' | 'nebula' | 'neon';

export interface Trail {
  id: TrailKind;
  name: string;
  colors: string[];
  price: Price;
  rarity: Rarity;
  desc?: string;
}

export const TRAILS: Trail[] = [
  { id: 'spark', name: 'Faísca', colors: ['#ffffff', '#ffe27a', '#ff9de6'], price: {}, rarity: 'common' },
  { id: 'bubbles', name: 'Bolhas', colors: ['#bdf5ff', '#7fd7ff', '#ffffff'], price: { coins: 300 }, rarity: 'common' },
  { id: 'smoke', name: 'Fumaça', colors: ['#c9c3e6', '#9a92c4', '#ffffff'], price: { coins: 600 }, rarity: 'common' },
  { id: 'hearts', name: 'Corações', colors: ['#ff4f8b', '#ff8fb5', '#ffd0e0'], price: { ads: 3 }, rarity: 'rare' },
  { id: 'fire', name: 'Fogo', colors: ['#ffea00', '#ff8a00', '#ff2d00'], price: { coins: 900 }, rarity: 'rare' },
  { id: 'petals', name: 'Pétalas', colors: ['#ffb7d5', '#ff8fc0', '#fff0f6', '#ffd1e6'], price: { coins: 1200 }, rarity: 'rare' },
  { id: 'notes', name: 'Melodia', colors: ['#ff6bd5', '#7df9ff', '#fff36b', '#b388ff'], price: { ads: 5 }, rarity: 'rare' },
  { id: 'pixels', name: '8-Bit', colors: ['#ff3b5c', '#3bff8a', '#3bb8ff', '#ffe13b', '#ffffff'], price: { coins: 2000 }, rarity: 'rare' },
  { id: 'stars', name: 'Estrelas', colors: ['#fff59d', '#ffffff', '#ffd54f'], price: { coins: 1600 }, rarity: 'epic' },
  { id: 'confetti', name: 'Confete', colors: ['#ff4f8b', '#4fc3ff', '#ffe14f', '#6dff8a', '#b388ff'], price: { coins: 2500 }, rarity: 'epic' },
  { id: 'comet', name: 'Cometa', colors: ['#ffffff', '#9fe8ff', '#4fa8ff'], price: { gems: 60 }, rarity: 'epic' },
  { id: 'brasil', name: 'Brasil', colors: ['#1fbf4f', '#ffdf1f', '#2f5bff', '#ffffff'], price: { ads: 8 }, rarity: 'epic', desc: 'Torcida verde-amarela!' },
  { id: 'rainbow', name: 'Arco-íris', colors: ['#ff3b3b', '#ff9f1a', '#ffe81a', '#3bff6b', '#1ac8ff', '#9b5cff'], price: { gems: 50 }, rarity: 'legendary' },
  { id: 'lightning', name: 'Elétrico', colors: ['#e1fbff', '#7df9ff', '#4d7cff'], price: { gems: 80 }, rarity: 'legendary' },
  { id: 'nebula', name: 'Nebulosa', colors: ['#b44dff', '#ff4fd8', '#4f7bff', '#7dfcff'], price: { gems: 150 }, rarity: 'legendary' },
  { id: 'neon', name: 'Fita Neon', colors: ['#ff2bd6', '#00fff0', '#ffffff'], price: { iap: 'trail_neon' }, rarity: 'mythic', desc: 'Exclusivo. Duas fitas de luz dançando.' },
];

/* ============================================================
 *  RARIDADE
 * ============================================================ */

export interface RarityInfo {
  /** rótulo pt-BR */
  label: string;
  /** cor sólida principal (selo/borda) */
  color: string;
  /** cor do brilho de fundo */
  glow: string;
  /** gradiente para selos (2 cores) */
  gradient: [string, string];
  /** 0 = comum ... 4 = mítico */
  order: number;
}

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  common: { label: 'Comum', color: '#8fa3c8', glow: '#9fb4e0', gradient: ['#6b7ca3', '#8fa3c8'], order: 0 },
  rare: { label: 'Raro', color: '#3f8cff', glow: '#4fa8ff', gradient: ['#2f6bff', '#4fc3ff'], order: 1 },
  epic: { label: 'Épico', color: '#b05cff', glow: '#c06bff', gradient: ['#8a3dff', '#d16bff'], order: 2 },
  legendary: { label: 'Lendário', color: '#ffb300', glow: '#ffc23d', gradient: ['#ffb300', '#ff3c7a'], order: 3 },
  mythic: { label: 'Mítico', color: '#ff3dce', glow: '#ff5ce1', gradient: ['#ff3dce', '#3de8ff'], order: 4 },
};

/** Skins agrupadas por raridade (na ordem do catálogo). */
export function skinsByRarity(): Record<Rarity, Skin[]> {
  const out: Record<Rarity, Skin[]> = { common: [], rare: [], epic: [], legendary: [], mythic: [] };
  for (const s of SKINS) out[s.rarity].push(s);
  return out;
}

/** Rastros agrupados por raridade. */
export function trailsByRarity(): Record<Rarity, Trail[]> {
  const out: Record<Rarity, Trail[]> = { common: [], rare: [], epic: [], legendary: [], mythic: [] };
  for (const t of TRAILS) out[t.rarity].push(t);
  return out;
}

/** true se o item só sai por evento (código promocional / presente). */
export const isEventOnly = (p: Price): boolean => !!p.event;

export const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const trailById = (id: string): Trail => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
