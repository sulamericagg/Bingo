/* ============================================================
 *  PASSE ESTELAR — gerador determinístico das 60 temporadas.
 *  Nada de 3000 recompensas escritas à mão: cada temporada é montada
 *  a partir do índice (semente) + tema/paleta de creatures/seasons.ts.
 *
 *  Regra das criaturas (dono): páginas ("cartelas") de 10 níveis.
 *   - Premium nível 1  = criatura comum (muito fofa) — a primeira coisa de quem compra.
 *   - Premium 20/30/40 = médio / raro / épico (último espaço da cartela).
 *   - Premium 50       = lendária, o "rei" da temporada.
 *  Tudo aqui é exclusivo do passe (nunca vendido).
 * ============================================================ */
import { PASS } from '../config';
import { SEASONS, seasonTheme, type SeasonInfo } from '../creatures/seasons';
import { t } from '../i18n';

export type PassRarity = 'common' | 'medio' | 'rare' | 'epic' | 'legendary';
export type RewardKind = 'mpass' | 'home' | 'creature' | 'eyes' | 'mouth' | 'aura' | 'emote' | 'music' | 'frame' | 'banner' | 'gems' | 'coins' | 'tickets';

export interface Reward {
  kind: RewardKind;
  /** id do item (criatura/peça/emote/música/moldura/faixa); vazio para moedas/gemas/ingressos */
  id: string;
  amount: number;
  name: string;
  rarity: PassRarity;
}

export interface PassLevel {
  level: number; // 1..50
  free: Reward | null;
  prem: Reward;
}

export interface PassSeason {
  info: SeasonInfo;
  /** substantivos temáticos usados nos nomes */
  motifs: string[];
  levels: PassLevel[];
}

/** 4 substantivos por tema (mesma ordem de SEASONS). Usados como "Olhos de X", "Aura de Y"... */
export const MOTIFS: string[][] = [
  ['Estrela-guia', 'Pinheiro', 'Sininho', 'Rena'],
  ['Fogos', 'Contagem', 'Meia-noite', 'Confete'],
  ['Serpentina', 'Pandeiro', 'Purpurina', 'Folia'],
  ['Cipó', 'Tucano', 'Orquídea', 'Cachoeira'],
  ['Pirulito', 'Algodão-doce', 'Brigadeiro', 'Jujuba'],
  ['Coral', 'Água-viva', 'Pérola', 'Golfinho'],
  ['Fogueira', 'Bandeirinha', 'Pipoca', 'Milho Verde'],
  ['Engrenagem', 'Parafuso', 'Circuito', 'Antena'],
  ['Fóssil', 'Vulcãozinho', 'Ovo Gigante', 'Samambaia'],
  ['Tesouro', 'Bússola', 'Mapa Estelar', 'Âncora'],
  ['Abóbora', 'Morceguinho', 'Caldeirão', 'Lua Cheia'],
  ['Floco de Neve', 'Iglu', 'Aurora', 'Pinguim'],
  ['Escama', 'Ovo de Dragão', 'Labareda', 'Castelo'],
  ['Batida', 'Guitarra', 'Microfone', 'Palco'],
  ['Skate', 'Prancha', 'Rampa', 'Capacete'],
  ['Pixel', 'Cartucho', 'Fliperama', 'Moedinha'],
  ['Varinha', 'Torre', 'Pergaminho', 'Coroa'],
  ['Cratera', 'Leãozinho Lunar', 'Binóculo', 'Poeira Lunar'],
  ['Letreiro', 'Arranha-céu', 'Holograma', 'Avenida'],
  ['Pétala', 'Asinha', 'Cogumelo', 'Orvalho'],
  ['Disfarce', 'Lupa', 'Código', 'Mala Secreta'],
  ['Magma', 'Rocha Quente', 'Fumaça', 'Cratera'],
  ['Picadeiro', 'Malabares', 'Trapézio', 'Lona'],
  ['Leque', 'Lanterna', 'Cerejeira', 'Templo'],
  ['Coqueiro', 'Conchinha', 'Onda', 'Abacaxi'],
  ['Tubo de Ensaio', 'Bolha', 'Fórmula', 'Faísca'],
  ['Arco-íris', 'Escudo', 'Unicórnio', 'Estandarte'],
  ['Cacto', 'Chapéu', 'Ferradura', 'Pôr do Sol'],
  ['Constelação', 'Oráculo', 'Pegasus', 'Olimpo'],
  ['Capa', 'Raio', 'Máscara', 'Super Salto'],
  ['Panqueca', 'Cupcake', 'Pizza Lunar', 'Chef'],
  ['Ametista', 'Diamante', 'Safira', 'Geodo'],
  ['Travesseiro', 'Pantufa', 'Cobertor', 'Lanterninha'],
  ['Faixa Ninja', 'Lua', 'Bambu', 'Sombra'],
  ['Gelatina', 'Pudim', 'Tremelique', 'Bolinha'],
  ['Pirâmide', 'Esfinge', 'Escaravelho', 'Oásis'],
  ['Relógio', 'Ampulheta', 'Portal', 'Máquina do Tempo'],
  ['Pião', 'Bloquinho', 'Ursinho', 'Ioiô'],
  ['Folha Seca', 'Bolota', 'Esquilo', 'Abóbora'],
  ['Lanterna-peixe', 'Bolha Funda', 'Polvo', 'Submarino'],
  ['Bola', 'Taça', 'Chuteira', 'Gol de Placa'],
  ['Engrenagem de Bronze', 'Vapor', 'Óculos', 'Dirigível'],
  ['Lanterna de Papel', 'Pipa', 'Lótus', 'Dragão de Papel'],
  ['Pinguim', 'Trenó', 'Boneco de Neve', 'Gelinho'],
  ['Disco Voador', 'Antena', 'Gosma', 'Raio Laser'],
  ['Joaninha', 'Vagalume', 'Abelhinha', 'Folha'],
  ['Cetro', 'Trono', 'Coroa', 'Tapete Real'],
  ['Tentáculo', 'Bolha', 'Concha', 'Maré'],
  ['Turbo', 'Bandeirada', 'Pneu', 'Pódio'],
  ['Nuvem', 'Balão', 'Arco-íris', 'Brisa'],
  ['Lupa', 'Pegada', 'Pista', 'Mistério'],
  ['Cogumelo', 'Esporo', 'Musgo', 'Bosque'],
  ['Medalha', 'Tocha', 'Pódio', 'Recorde'],
  ['Poção', 'Chapéu Pontudo', 'Grimório', 'Caldeirão'],
  ['Mecha', 'Propulsor', 'Painel', 'Turbina'],
  ['Duna', 'Miragem', 'Camelo', 'Oásis'],
  ['Aurora', 'Céu Polar', 'Cometa', 'Brilho Verde'],
  ['Roda-gigante', 'Carrossel', 'Pipoca', 'Montanha-russa'],
  ['Galáxia', 'Supernova', 'Nebulosa', 'Lenda'],
  ['Bolo', 'Vela', 'Balão', 'Festa'],
];

const NN = (i: number) => String(i).padStart(2, '0');

/** chave estável de um motivo (pt-BR → ascii) e nome traduzível: t('pass.motif.<slug>') */
export const motifSlug = (m: string): string =>
  m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const motifName = (m: string): string => t(`pass.motif.${motifSlug(m)}`, m);

/** PRNG determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cartelas: tipos de recompensa premium por página (C = criatura). Ordem embaralhada por temporada, criatura fixa. */
type Slot = RewardKind;
const PAGES: Slot[][] = [
  ['eyes', 'emote', 'gems', 'gems', 'coins', 'tickets', 'mouth', 'aura', 'music'],
  ['eyes', 'emote', 'gems', 'gems', 'coins', 'tickets', 'mouth', 'coins', 'tickets'],
  ['aura', 'emote', 'gems', 'gems', 'coins', 'tickets', 'frame', 'coins', 'tickets'],
  ['eyes', 'emote', 'gems', 'gems', 'coins', 'tickets', 'mouth', 'coins', 'tickets'],
  ['aura', 'emote', 'gems', 'gems', 'music', 'tickets', 'banner', 'coins', 'coins'],
];
const PAGE_CREATURE: PassRarity[] = ['common', 'medio', 'rare', 'epic', 'legendary'];

const RAR_BY_KIND: Partial<Record<RewardKind, PassRarity[]>> = {
  eyes: ['rare', 'epic', 'legendary'],
  mouth: ['rare', 'epic', 'legendary'],
  aura: ['rare', 'epic', 'legendary'],
  emote: ['medio', 'rare', 'rare', 'epic', 'legendary'],
  music: ['epic', 'legendary'],
};

export const creatureId = (season: number, r: PassRarity) => `s${NN(season)}-${r}`;

/** Nomes das criaturas (preenchidos pelo catálogo real quando carregado; ver creatures-bridge.ts). */
export const creatureNames = new Map<string, string>();
/** id do passe ('sNN-raridade') → id real do catálogo de criaturas (quando diferente). */
export const creatureRealIds = new Map<string, string>();
export const realCreatureId = (id: string): string => creatureRealIds.get(id) ?? id;

const RAR_LABEL = (): Record<PassRarity, string> => ({
  common: t('pass.rar.common', 'Comum'),
  medio: t('pass.rar.medio', 'Médio'),
  rare: t('pass.rar.rare', 'Raro'),
  epic: t('pass.rar.epic', 'Épico'),
  legendary: t('pass.rar.legendary', 'Lendário'),
});
export const rarityLabel = (r: PassRarity): string => RAR_LABEL()[r];

function nameFor(kind: RewardKind, motif: string, theme: string, n: number, amount: number, id: string): string {
  switch (kind) {
    case 'eyes':
      return t('pass.n.eyes', 'Olhos de {m}', { m: motif });
    case 'mouth':
      return [t('pass.n.mouth1', 'Sorriso de {m}', { m: motif }), t('pass.n.mouth2', 'Boca de {m}', { m: motif })][n % 2];
    case 'aura':
      return t('pass.n.aura', 'Aura de {m}', { m: motif });
    case 'emote':
      return [
        t('pass.n.em0', 'Dança do {m}', { m: motif }),
        t('pass.n.em1', 'Giro de {m}', { m: motif }),
        t('pass.n.em2', 'Aceno de {m}', { m: motif }),
        t('pass.n.em3', 'Festa de {m}', { m: motif }),
        t('pass.n.em4', 'Pulinho de {m}', { m: motif }),
      ][n % 5];
    case 'music':
      return n === 0 ? t('pass.n.music0', 'Tema: {th}', { th: theme }) : t('pass.n.music1', 'Remix de {m}', { m: motif });
    case 'frame':
      return t('pass.n.frame', 'Moldura {th}', { th: theme });
    case 'banner':
      return t('pass.n.banner', 'Faixa {th}', { th: theme });
    case 'gems':
      return t('pass.n.gems', '{n} Gemas', { n: amount });
    case 'coins':
      return t('pass.n.coins', '{n} Moedas', { n: amount });
    case 'tickets':
      return amount === 1 ? t('pass.n.ticket', '1 Ingresso') : t('pass.n.tickets', '{n} Ingressos', { n: amount });
    case 'creature':
      return creatureNames.get(id) ?? t('pass.n.creature', 'Bichinho {m}', { m: motif });
    case 'home':
    case 'mpass':
      return id;
  }
}

const cache = new Map<number, PassSeason>();

/** Monta (e memoriza) a temporada `index` (0..59). */
export function passSeason(index: number): PassSeason {
  const hit = cache.get(index);
  if (hit) return hit;
  const info = SEASONS[Math.max(0, Math.min(SEASONS.length - 1, index))];
  const motifs = MOTIFS[info.index] ?? MOTIFS[0];
  const r = rng(0xb100b + info.index * 7919);
  const counters: Partial<Record<RewardKind, number>> = {};
  const levels: PassLevel[] = [];
  const s = NN(info.index);
  for (let p = 0; p < 5; p++) {
    const slots = [...PAGES[p]];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    // página 1: criatura no nível 1; páginas 2-5: no último espaço
    const order: Slot[] = p === 0 ? ['creature', ...slots] : [...slots, 'creature'];
    for (let k = 0; k < 10; k++) {
      const level = p * 10 + k + 1;
      const kind = order[k];
      const n = counters[kind] ?? 0;
      counters[kind] = n + 1;
      const motif = motifs[(n + p) % motifs.length];
      let id = '';
      let amount = 0;
      let rarity: PassRarity = 'common';
      switch (kind) {
        case 'creature':
          rarity = PAGE_CREATURE[p];
          id = creatureId(info.index, rarity);
          break;
        case 'eyes':
          id = `pe_s${s}_${n + 1}`;
          break;
        case 'mouth':
          id = `pm_s${s}_${n + 1}`;
          break;
        case 'aura':
          id = `pa_s${s}_${n + 1}`;
          break;
        case 'emote':
          id = `em_s${s}_${n + 1}`;
          break;
        case 'music':
          id = `mu_s${s}_${n + 1}`;
          break;
        case 'frame':
          id = `fr_s${s}`;
          rarity = 'epic';
          break;
        case 'banner':
          id = `bn_s${s}`;
          rarity = 'legendary';
          break;
        case 'gems':
          amount = 100; // 10 × 100 = 1000 gemas: dá para comprar o próximo passe (950)
          rarity = 'rare';
          break;
        case 'coins':
          amount = 500 + Math.round(level / 5) * 100;
          rarity = 'common';
          break;
        case 'tickets':
          amount = 1 + Math.floor(level / 20);
          rarity = 'medio';
          break;
      }
      const rr = RAR_BY_KIND[kind];
      if (rr) rarity = rr[Math.min(rr.length - 1, n)];
      levels.push({ level, free: null, prem: { kind, id, amount, rarity, name: nameFor(kind, motifName(motif), seasonTheme(info), n, amount, id) } });
    }
  }
  // trilha grátis: nível 1 para TODOS + um prêmio a cada 2 níveis
  for (const L of levels) {
    const lv = L.level;
    const motif = motifs[lv % motifs.length];
    let f: Omit<Reward, 'name'> | null = null;
    if (lv === 1) f = info.index % 2 === 0 ? { kind: 'eyes', id: `pe_s${s}_f`, amount: 0, rarity: 'medio' } : { kind: 'music', id: `mu_s${s}_f`, amount: 0, rarity: 'medio' };
    else if (lv === 25) f = { kind: 'emote', id: `em_s${s}_f`, amount: 0, rarity: 'rare' };
    else if (lv % 10 === 0) f = { kind: 'gems', id: '', amount: 20, rarity: 'rare' };
    else if (lv % 6 === 0) f = { kind: 'tickets', id: '', amount: 1, rarity: 'medio' };
    else if (lv % 2 === 0) f = { kind: 'coins', id: '', amount: 150 + lv * 10, rarity: 'common' };
    if (f) L.free = { ...f, name: nameFor(f.kind, motifName(motif), seasonTheme(info), f.kind === 'emote' ? 3 : 0, f.amount, f.id) };
  }
  const season: PassSeason = { info, motifs, levels: levels.slice(0, PASS.levels) };
  cache.set(index, season);
  return season;
}

/** Todos os itens de uma temporada (para histórico "o que você pegou / perdeu"). */
export function seasonItems(index: number): { level: number; track: 'free' | 'prem'; r: Reward }[] {
  const out: { level: number; track: 'free' | 'prem'; r: Reward }[] = [];
  for (const L of passSeason(index).levels) {
    if (L.free) out.push({ level: L.level, track: 'free', r: L.free });
    out.push({ level: L.level, track: 'prem', r: L.prem });
  }
  return out;
}

/** Procura uma recompensa por id em qualquer temporada (id embute a temporada: ..._sNN_...). */
export function findReward(id: string): Reward | null {
  const m = /s(\d\d)/.exec(id);
  if (!m) return null;
  for (const it of seasonItems(Number(m[1]))) if (it.r.id === id) return it.r;
  return null;
}

/** Semente estável a partir de um id (para desenhos/músicas procedurais). */
export function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
