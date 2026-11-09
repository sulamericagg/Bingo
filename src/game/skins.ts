export type Accessory = 'none' | 'antenna' | 'leaf' | 'horns' | 'cat' | 'crown' | 'halo' | 'helmet' | 'headband' | 'robot' | 'bow' | 'flame';
export type Pattern = 'none' | 'spots' | 'stripes' | 'galaxy' | 'shine' | 'ghost';

export interface Price {
  coins?: number;
  gems?: number;
  ads?: number;
  iap?: string;
}

export interface Skin {
  id: string;
  name: string;
  light: string;
  dark: string;
  belly: string;
  eye: string;
  accessory: Accessory;
  accent: string;
  pattern: Pattern;
  price: Price;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export const SKINS: Skin[] = [
  { id: 'bloop', name: 'Bloop', light: '#ff8fd8', dark: '#b63fd6', belly: '#ffd2f1', eye: '#2a1140', accessory: 'antenna', accent: '#fff36b', pattern: 'none', price: {}, rarity: 'common' },
  { id: 'mint', name: 'Hortelã', light: '#9dffcb', dark: '#19b67f', belly: '#e1ffef', eye: '#0d3527', accessory: 'leaf', accent: '#3fe06c', pattern: 'spots', price: { coins: 250 }, rarity: 'common' },
  { id: 'sunny', name: 'Solzinho', light: '#fff38a', dark: '#ffaa1c', belly: '#fffbe0', eye: '#4a2a00', accessory: 'bow', accent: '#ff5d8f', pattern: 'none', price: { coins: 450 }, rarity: 'common' },
  { id: 'ocean', name: 'Oceano', light: '#8fe9ff', dark: '#2a6dff', belly: '#dff8ff', eye: '#081a45', accessory: 'helmet', accent: '#bff3ff', pattern: 'spots', price: { coins: 700 }, rarity: 'rare' },
  { id: 'kitty', name: 'Gatinho', light: '#ffc58f', dark: '#f0702a', belly: '#fff0e0', eye: '#3a1800', accessory: 'cat', accent: '#ff9bb3', pattern: 'stripes', price: { coins: 1000 }, rarity: 'rare' },
  { id: 'angel', name: 'Anjinho', light: '#ffffff', dark: '#b7c8ff', belly: '#ffffff', eye: '#283070', accessory: 'halo', accent: '#ffe35c', pattern: 'shine', price: { ads: 5 }, rarity: 'rare' },
  { id: 'devil', name: 'Capetinha', light: '#ff7a7a', dark: '#c4123a', belly: '#ffd0d0', eye: '#2a0008', accessory: 'horns', accent: '#4a0613', pattern: 'none', price: { coins: 1500 }, rarity: 'rare' },
  { id: 'ghost', name: 'Fantasminha', light: '#f1f6ff', dark: '#8f9dd8', belly: '#ffffff', eye: '#1b1f3d', accessory: 'none', accent: '#9fd8ff', pattern: 'ghost', price: { coins: 2200 }, rarity: 'epic' },
  { id: 'ninja', name: 'Ninja', light: '#5d6b8a', dark: '#1a1f33', belly: '#c9d3ea', eye: '#ffffff', accessory: 'headband', accent: '#ff3b5c', pattern: 'none', price: { gems: 40 }, rarity: 'epic' },
  { id: 'robot', name: 'Robô X', light: '#d9e6f2', dark: '#6d7f99', belly: '#9fb6cc', eye: '#00e5ff', accessory: 'robot', accent: '#00e5ff', pattern: 'shine', price: { gems: 70 }, rarity: 'epic' },
  { id: 'fire', name: 'Brasa', light: '#ffd36b', dark: '#ff3d00', belly: '#fff1c2', eye: '#3a0a00', accessory: 'flame', accent: '#ffea00', pattern: 'none', price: { gems: 90 }, rarity: 'epic' },
  { id: 'king', name: 'Rei Dourado', light: '#fff1a6', dark: '#d79a00', belly: '#fff8d6', eye: '#3d2600', accessory: 'crown', accent: '#ff2e63', pattern: 'shine', price: { gems: 150 }, rarity: 'legendary' },
  { id: 'galaxy', name: 'Galáxia', light: '#7f6bff', dark: '#1a0b5c', belly: '#c7b8ff', eye: '#ffffff', accessory: 'antenna', accent: '#7dfcff', pattern: 'galaxy', price: { iap: 'starter_pack' }, rarity: 'legendary' },
];

export type TrailKind = 'spark' | 'bubbles' | 'fire' | 'stars' | 'hearts' | 'confetti' | 'rainbow' | 'lightning';

export interface Trail {
  id: TrailKind;
  name: string;
  colors: string[];
  price: Price;
}

export const TRAILS: Trail[] = [
  { id: 'spark', name: 'Faísca', colors: ['#ffffff', '#ffe27a', '#ff9de6'], price: {} },
  { id: 'bubbles', name: 'Bolhas', colors: ['#bdf5ff', '#7fd7ff', '#ffffff'], price: { coins: 300 } },
  { id: 'hearts', name: 'Corações', colors: ['#ff4f8b', '#ff8fb5', '#ffd0e0'], price: { ads: 3 } },
  { id: 'fire', name: 'Fogo', colors: ['#ffea00', '#ff8a00', '#ff2d00'], price: { coins: 900 } },
  { id: 'stars', name: 'Estrelas', colors: ['#fff59d', '#ffffff', '#ffd54f'], price: { coins: 1600 } },
  { id: 'confetti', name: 'Confete', colors: ['#ff4f8b', '#4fc3ff', '#ffe14f', '#6dff8a', '#b388ff'], price: { coins: 2500 } },
  { id: 'rainbow', name: 'Arco-íris', colors: ['#ff3b3b', '#ff9f1a', '#ffe81a', '#3bff6b', '#1ac8ff', '#9b5cff'], price: { gems: 50 } },
  { id: 'lightning', name: 'Elétrico', colors: ['#e1fbff', '#7df9ff', '#4d7cff'], price: { gems: 80 } },
];

export const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const trailById = (id: string): Trail => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
