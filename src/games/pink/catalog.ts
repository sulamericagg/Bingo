/* ============================================================
 *  BLOOP PINK — catálogo de produtos (todos INVENTADOS).
 *  Nomes são nomes próprios fictícios (não traduzidos, como as músicas da Banda);
 *  categorias e estações passam por t().
 *  Ano do jogo = 120 dias. Cada produto: nível (licença), custo, preço de mercado,
 *  estação (multiplica a procura) e curva de popularidade (sino com pico num dia).
 * ============================================================ */
import { t } from '../../i18n';

export type CatId = 'splash' | 'perfume' | 'lips' | 'face' | 'nails' | 'skin' | 'hair' | 'supl' | 'acc' | 'gift';
export type Shape = 'splash' | 'perfume' | 'lipstick' | 'gloss' | 'compact' | 'mascara' | 'polish' | 'tube' | 'dropper' | 'jar' | 'pump' | 'tub' | 'pills' | 'pouch' | 'brush' | 'giftbox';
export type SeasonId = 'maes' | 'namorados' | 'verao' | 'black' | 'natal';

export interface Category {
  id: CatId;
  name: string;
  /** nível da licença */
  lvl: number;
  /** preço da licença */
  price: number;
  color: string;
  icon: string;
}

export const CATS: Category[] = [
  { id: 'splash', get name() { return t('pink.cat.splash', 'Body splash'); }, lvl: 1, price: 0, color: '#ff8cc0', icon: 'splash' },
  { id: 'lips', get name() { return t('pink.cat.lips', 'Batom e gloss'); }, lvl: 1, price: 0, color: '#e8336f', icon: 'lips' },
  { id: 'nails', get name() { return t('pink.cat.nails', 'Unhas'); }, lvl: 1, price: 0, color: '#c54bd6', icon: 'nails' },
  { id: 'face', get name() { return t('pink.cat.face', 'Maquiagem'); }, lvl: 3, price: 400, color: '#f2a07b', icon: 'face' },
  { id: 'skin', get name() { return t('pink.cat.skin', 'Skincare'); }, lvl: 5, price: 900, color: '#7fd1c7', icon: 'skin' },
  { id: 'hair', get name() { return t('pink.cat.hair', 'Cabelo'); }, lvl: 12, price: 2400, color: '#b48cff', icon: 'hair' },
  { id: 'perfume', get name() { return t('pink.cat.perfume', 'Perfumes'); }, lvl: 1, price: 0, color: '#f5c46b', icon: 'perfume' },
  { id: 'supl', get name() { return t('pink.cat.supl', 'Suplementos'); }, lvl: 18, price: 4200, color: '#8fd16a', icon: 'supl' },
  { id: 'acc', get name() { return t('pink.cat.acc', 'Acessórios'); }, lvl: 24, price: 6000, color: '#6aa8ff', icon: 'acc' },
  { id: 'gift', get name() { return t('pink.cat.gift', 'Kits presente'); }, lvl: 28, price: 8000, color: '#ff6b6b', icon: 'gift' },
];
export const CAT: Record<CatId, Category> = Object.fromEntries(CATS.map((c) => [c.id, c])) as Record<CatId, Category>;

export interface Season {
  id: SeasonId;
  name: string;
  /** dias (0..119) inclusivos */
  from: number;
  to: number;
  /** categorias que bombam e quanto */
  boost: Partial<Record<CatId, number>>;
  /** todas as vendas × (Black Friday) */
  all?: number;
  color: string;
}
export const SEASONS: Season[] = [
  { id: 'verao', get name() { return t('pink.season.verao', 'Verão'); }, from: 0, to: 14, boost: { splash: 1.8, skin: 1.6, hair: 1.2 }, color: '#ffb84a' },
  { id: 'maes', get name() { return t('pink.season.maes', 'Dia das Mães'); }, from: 20, to: 27, boost: { perfume: 2.2, gift: 2.5, skin: 1.4, acc: 1.4 }, color: '#ff7aa8' },
  { id: 'namorados', get name() { return t('pink.season.namorados', 'Dia dos Namorados'); }, from: 34, to: 40, boost: { perfume: 2, lips: 1.8, gift: 2 }, color: '#ff4f6d' },
  { id: 'black', get name() { return t('pink.season.black', 'Black Friday'); }, from: 88, to: 92, boost: {}, all: 2, color: '#2a2a2a' },
  { id: 'natal', get name() { return t('pink.season.natal', 'Natal'); }, from: 95, to: 104, boost: { gift: 3, perfume: 1.8, acc: 1.6 }, color: '#2fa35a' },
  { id: 'verao', get name() { return t('pink.season.verao', 'Verão'); }, from: 105, to: 119, boost: { splash: 1.8, skin: 1.6, hair: 1.2 }, color: '#ffb84a' },
];
export const YEAR = 120;
export function seasonAt(day: number): Season | null {
  const d = ((day % YEAR) + YEAR) % YEAR;
  return SEASONS.find((s) => d >= s.from && d <= s.to) ?? null;
}

export interface Product {
  id: string;
  /** nome próprio fictício */
  name: string;
  cat: CatId;
  shape: Shape;
  /** 1 básico · 2 médio · 3 premium */
  tier: 1 | 2 | 3;
  /** custo por unidade (pedido) */
  cost: number;
  /** preço de mercado (referência do cliente) */
  mkt: number;
  /** cor principal (frasco/embalagem) e da tampa */
  color: string;
  cap: string;
  /** frasco de vidro (quebra ao cair) */
  glass: boolean;
  /** nível mínimo (licença da categoria e/ou tier) */
  lvl: number;
  /** unidades por caixa */
  box: number;
  /** procura base 0..1 */
  pop: number;
  /** dia de pico da moda (0..119) e largura do sino */
  peak: number;
  width: number;
  /** estação favorita (extra) */
  season?: SeasonId;
}

/* [nome, tier, custo, cor, tampa, estação?] — por categoria; forma escolhida por linha */
type Row = [string, 1 | 2 | 3, number, string, string, SeasonId?];
const ROWS: { cat: CatId; shape: Shape; glass?: boolean; box: number; rows: Row[] }[] = [
  { cat: 'splash', shape: 'splash', box: 12, rows: [
    ['Nuvem de Algodão', 1, 9, '#ffd6ec', '#ffffff'],
    ['Chuva de Morango', 1, 9, '#ff6b8f', '#ffffff', 'verao'],
    ['Pêssego Dourado', 1, 10, '#ffb27a', '#f7e3c5', 'verao'],
    ['Melancia Gelada', 1, 10, '#ff5a6e', '#7fd16a', 'verao'],
    ['Baunilha Bolha', 1, 9, '#f6e2b8', '#ffffff'],
    ['Coco Praiano', 1, 11, '#f4efe6', '#c89a6a', 'verao'],
    ['Lichia Neon', 2, 14, '#ff4fbf', '#ffffff'],
    ['Maracujá Brisa', 2, 14, '#ffd84a', '#8bc34a', 'verao'],
    ['Flor de Algodão-Doce', 2, 15, '#d7b8ff', '#ffffff'],
    ['Pitaya Glow', 2, 16, '#ff3f9e', '#fff0f6'],
    ['Céu Lilás', 2, 15, '#b9a2ff', '#ffffff'],
    ['Brilho de Verão', 3, 22, '#ffcf6b', '#e8b86a', 'verao'],
    ['Rosé Sorvete', 3, 22, '#ffb3cf', '#e8b86a', 'namorados'],
  ] },
  { cat: 'perfume', shape: 'perfume', glass: true, box: 6, rows: [
    ['Colônia Primavera', 1, 16, '#ffe1ee', '#d9a9c0'],
    ['Colônia Brisa do Mar', 1, 16, '#c8ecff', '#a9c4d9'],
    ['Água de Rosas Bloop', 1, 18, '#ffc9dc', '#e8b86a', 'maes'],
    ['Jasmim da Tarde', 2, 34, '#fff3c4', '#e8b86a', 'maes'],
    ['Segredo Rosa', 2, 38, '#ff9ac4', '#c99a5a', 'namorados'],
    ['Âmbar Lunar', 2, 40, '#f2b45a', '#6a4a2a'],
    ['Peônia Real', 2, 42, '#ff7fb2', '#e8b86a', 'maes'],
    ['Noite em Paris-Bloop', 3, 70, '#5a2a6a', '#e8b86a', 'namorados'],
    ['Cristal de Orquídea', 3, 76, '#e7d4ff', '#c0c0c8'],
    ['Ouro Rosé Eau', 3, 82, '#f7c1a8', '#e8b86a', 'natal'],
    ['Veludo Cereja', 3, 74, '#a4123f', '#e8b86a', 'namorados'],
    ['Flor de Laranjeira Nobre', 3, 68, '#ffe0a8', '#e8b86a', 'maes'],
    ['Musgo Branco', 2, 36, '#e9f2e6', '#9ab08a'],
    ['Diamante Pink', 3, 96, '#ff5fa2', '#f2f2f2', 'natal'],
  ] },
  { cat: 'lips', shape: 'lipstick', box: 24, rows: [
    ['Batom Beijinho', 1, 6, '#e8336f', '#ffd3e6', 'namorados'],
    ['Batom Cereja Mate', 1, 6, '#b5123a', '#2a2a2a'],
    ['Batom Nude Pêssego', 1, 6, '#d98f7a', '#f2d6c8'],
    ['Batom Uva Vibe', 1, 7, '#7a2a6a', '#2a2a2a'],
    ['Batom Coral Sol', 1, 7, '#ff6f61', '#ffd3e6', 'verao'],
    ['Batom Rosa Chiclete', 1, 7, '#ff6fb5', '#ffffff'],
    ['Batom Vermelho Paixão', 2, 11, '#d0102a', '#e8b86a', 'namorados'],
    ['Batom Malva Seda', 2, 11, '#b07a8a', '#e8b86a'],
    ['Batom Cacau Cremoso', 2, 11, '#7a4a3a', '#e8b86a'],
    ['Batom Ouro Rosé', 3, 19, '#c96a7a', '#e8b86a', 'natal'],
  ] },
  { cat: 'lips', shape: 'gloss', box: 24, rows: [
    ['Gloss Cristal', 1, 5, '#ffe6f0', '#ffffff'],
    ['Gloss Morango Glitter', 1, 6, '#ff7aa8', '#ffffff'],
    ['Gloss Melzinho', 1, 6, '#f2b45a', '#ffffff'],
    ['Gloss Volume Pink', 2, 10, '#ff3f9e', '#e8b86a'],
    ['Gloss Óleo de Cereja', 2, 10, '#c2185b', '#e8b86a', 'namorados'],
    ['Gloss Holográfico', 3, 15, '#d7b8ff', '#c0c0c8'],
  ] },
  { cat: 'nails', shape: 'polish', glass: true, box: 24, rows: [
    ['Esmalte Algodão', 1, 4, '#fff0f6', '#2a2a2a'],
    ['Esmalte Pink Pop', 1, 4, '#ff3f9e', '#2a2a2a'],
    ['Esmalte Vermelho Clássico', 1, 4, '#c2102a', '#2a2a2a'],
    ['Esmalte Lavanda', 1, 4, '#c3a6ff', '#2a2a2a'],
    ['Esmalte Menta', 1, 4, '#9fe6c8', '#2a2a2a', 'verao'],
    ['Esmalte Céu Azul', 1, 4, '#8ccfff', '#2a2a2a', 'verao'],
    ['Esmalte Nude Café', 1, 4, '#c8a08a', '#2a2a2a'],
    ['Esmalte Glitter Estrela', 2, 7, '#e8d8ff', '#e8b86a', 'natal'],
    ['Esmalte Preto Rock', 1, 4, '#1f1a24', '#2a2a2a'],
    ['Esmalte Coral Tropical', 1, 4, '#ff7f66', '#2a2a2a', 'verao'],
    ['Esmalte Holo Unicórnio', 2, 8, '#ffc6ef', '#c0c0c8'],
    ['Esmalte Gel Efeito Vidro', 3, 12, '#ff9ac4', '#e8b86a'],
  ] },
  { cat: 'nails', shape: 'giftbox', box: 6, rows: [
    ['Kit Manicure Fofa', 2, 18, '#ffb3d1', '#ffffff'],
    ['Kit Unhas Arco-Íris', 2, 20, '#c3a6ff', '#ffffff'],
    ['Kit Nail Art Studio', 3, 34, '#ff5fa2', '#e8b86a', 'natal'],
  ] },
  { cat: 'face', shape: 'compact', box: 12, rows: [
    ['Blush Bochechinha', 1, 9, '#ff8fa8', '#2a2a2a'],
    ['Blush Pêssego Luz', 1, 9, '#ffad8a', '#2a2a2a', 'verao'],
    ['Pó Solto Nuvem', 1, 10, '#f2d6c8', '#ffffff'],
    ['Sombra Paleta Sunset', 2, 22, '#ff9a5a', '#2a2a2a'],
    ['Sombra Paleta Galáxia', 2, 24, '#6a4aa8', '#2a2a2a'],
    ['Sombra Paleta Rosé', 2, 24, '#e8a0b4', '#e8b86a', 'maes'],
    ['Iluminador Pérola', 2, 18, '#fff3e6', '#e8b86a'],
    ['Contorno Mágico', 2, 16, '#a8786a', '#2a2a2a'],
    ['Paleta Festa Dourada', 3, 38, '#e8b86a', '#2a2a2a', 'natal'],
  ] },
  { cat: 'face', shape: 'tube', box: 12, rows: [
    ['Base Leve Tom 1', 1, 12, '#f6dcc8', '#ffffff'],
    ['Base Leve Tom 2', 1, 12, '#e2b896', '#ffffff'],
    ['Base Leve Tom 3', 1, 12, '#b98463', '#ffffff'],
    ['Base Leve Tom 4', 1, 12, '#8a5a3e', '#ffffff'],
    ['Base Matte Pro', 2, 24, '#d9a986', '#2a2a2a'],
    ['Primer Glow', 2, 20, '#ffe6f0', '#e8b86a'],
    ['Corretivo Disfarça', 1, 10, '#f2c8a8', '#ffffff'],
  ] },
  { cat: 'face', shape: 'mascara', box: 24, rows: [
    ['Máscara Cílios de Boneca', 1, 10, '#2a2a2a', '#ff5fa2'],
    ['Máscara Volume Bomba', 2, 16, '#1a1a1a', '#e8b86a'],
    ['Máscara À Prova d\'Água', 2, 17, '#1a1a2a', '#8ccfff', 'verao'],
    ['Delineador Gatinho', 1, 9, '#111111', '#ff5fa2'],
  ] },
  { cat: 'skin', shape: 'dropper', glass: true, box: 12, rows: [
    ['Sérum Vitamina Sol', 2, 26, '#ffcf6b', '#2a2a2a'],
    ['Sérum Hialurônico Gota', 2, 28, '#c8ecff', '#ffffff'],
    ['Sérum Noite Calma', 3, 44, '#6a4aa8', '#e8b86a'],
    ['Óleo Facial Rosa Mosqueta', 2, 24, '#ffb3a8', '#e8b86a', 'maes'],
  ] },
  { cat: 'skin', shape: 'jar', box: 12, rows: [
    ['Hidratante Nuvem', 1, 14, '#ffffff', '#ff8cc0'],
    ['Creme Mãos de Fada', 1, 8, '#ffe6f0', '#e8b86a', 'maes'],
    ['Máscara Facial Argila Rosa', 2, 18, '#ffb3c8', '#ffffff'],
    ['Creme Noturno Lua', 3, 42, '#3a3a6a', '#e8b86a'],
    ['Esfoliante Açúcar Mel', 2, 16, '#f2b45a', '#ffffff'],
  ] },
  { cat: 'skin', shape: 'tube', box: 12, rows: [
    ['Protetor Solar FPS 50', 1, 16, '#ffe14a', '#ff8a3a', 'verao'],
    ['Protetor Solar Toque Seco', 2, 22, '#ffffff', '#ff8a3a', 'verao'],
    ['Gel Limpeza Pepino', 1, 12, '#9fe6a8', '#ffffff'],
    ['Hidratante Labial Morango', 1, 5, '#ff6b8f', '#ffffff'],
    ['Pós-Sol Aloe Gelado', 1, 12, '#8fd16a', '#ffffff', 'verao'],
  ] },
  { cat: 'hair', shape: 'pump', box: 8, rows: [
    ['Shampoo Brilho de Seda', 1, 14, '#ffd6ec', '#ffffff'],
    ['Condicionador Seda', 1, 14, '#ff9ac4', '#ffffff'],
    ['Shampoo Cachos Felizes', 2, 18, '#b48cff', '#ffffff'],
    ['Leave-in Nuvem de Cachos', 2, 20, '#d7b8ff', '#e8b86a'],
    ['Óleo Capilar Ouro Líquido', 3, 34, '#f2b45a', '#2a2a2a'],
    ['Shampoo Verão Salgado', 1, 15, '#8ccfff', '#ffffff', 'verao'],
  ] },
  { cat: 'hair', shape: 'jar', box: 8, rows: [
    ['Máscara Capilar Banana', 1, 16, '#ffe14a', '#ffffff'],
    ['Máscara Reconstrução', 2, 24, '#ff8cc0', '#e8b86a'],
    ['Pomada Penteado Fofo', 1, 12, '#c3a6ff', '#2a2a2a'],
  ] },
  { cat: 'supl', shape: 'tub', box: 6, rows: [
    ['Colágeno Rosa Fit', 2, 38, '#ff8cc0', '#ffffff'],
    ['Whey Morango Pote', 2, 48, '#ff6b8f', '#2a2a2a'],
    ['Whey Baunilha Pote', 2, 48, '#f6e2b8', '#2a2a2a'],
    ['Whey Chocolate Pote', 2, 48, '#7a4a3a', '#2a2a2a'],
    ['Colágeno Verão Limão', 2, 38, '#ffe14a', '#ffffff', 'verao'],
  ] },
  { cat: 'supl', shape: 'pills', box: 12, rows: [
    ['Vitamina C Gotinha', 1, 14, '#ffb84a', '#ffffff'],
    ['Biotina Cabelo & Unha', 2, 22, '#d7b8ff', '#ffffff'],
    ['Multivitamínico Bloop', 2, 24, '#8fd16a', '#ffffff'],
    ['Ômega Beleza', 2, 26, '#8ccfff', '#ffffff'],
  ] },
  { cat: 'acc', shape: 'brush', box: 12, rows: [
    ['Pincel Kabuki Fofo', 1, 10, '#ff8cc0', '#e8b86a'],
    ['Kit Pincéis Nuvem', 2, 24, '#ffd6ec', '#e8b86a'],
    ['Escova Desembaraça', 1, 12, '#b48cff', '#ffffff'],
    ['Esponja Gota Mágica', 1, 5, '#ff5fa2', '#ff5fa2'],
    ['Curvex Rosé', 1, 9, '#c0c0c8', '#ff8cc0'],
  ] },
  { cat: 'acc', shape: 'pouch', box: 8, rows: [
    ['Necessaire Coração', 1, 14, '#ff8cc0', '#e8b86a'],
    ['Necessaire Viagem', 2, 22, '#6aa8ff', '#e8b86a', 'verao'],
    ['Bolsinha Glitter', 2, 18, '#e8d8ff', '#c0c0c8', 'natal'],
    ['Kit Presilhas Laço', 1, 8, '#ffb3d1', '#ffffff'],
    ['Espelhinho Bolso', 1, 7, '#ffd6ec', '#c0c0c8'],
  ] },
  { cat: 'gift', shape: 'giftbox', box: 4, rows: [
    ['Kit Mãe Rainha', 2, 58, '#ff7aa8', '#e8b86a', 'maes'],
    ['Kit Amor de Namorados', 2, 56, '#e8336f', '#e8b86a', 'namorados'],
    ['Kit Natal Encantado', 2, 60, '#2fa35a', '#e83a3a', 'natal'],
    ['Kit Verão na Praia', 1, 36, '#ffcf6b', '#8ccfff', 'verao'],
    ['Kit Spa em Casa', 2, 52, '#9fe6c8', '#ffffff'],
    ['Kit Primeira Maquiagem', 1, 34, '#ffd6ec', '#ff5fa2'],
    ['Caixa Surpresa Bloop', 3, 80, '#ff5fa2', '#e8b86a', 'black'],
    ['Kit Luxo Dourado', 3, 120, '#2a1a2a', '#e8b86a', 'natal'],
  ] },
];

/** hash determinístico simples (para popularidade/pico por produto) */
function h(s: string, k: number): number {
  let x = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return ((x >>> 0) % 10000) / 10000;
}
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const PRODUCTS: Product[] = [];
for (const grp of ROWS) {
  const cat = CATS.find((c) => c.id === grp.cat)!;
  for (const [name, tier, cost, color, cap, season] of grp.rows) {
    const id = slug(name);
    const markup = 1.6 + h(id, 1) * 0.6;
    const lvl = Math.max(cat.lvl, tier === 1 ? 1 : tier === 2 ? 4 : 15, grp.cat === 'perfume' && tier === 3 ? 15 : 0, grp.shape === 'giftbox' && grp.cat === 'nails' ? 7 : 0);
    PRODUCTS.push({
      id,
      name,
      cat: grp.cat,
      shape: grp.shape,
      tier,
      cost,
      mkt: Math.round(cost * markup) - 0.1,
      color,
      cap,
      glass: !!grp.glass,
      lvl,
      box: grp.box,
      pop: 0.4 + h(id, 2) * 0.6 - (tier - 1) * 0.08,
      peak: Math.floor(h(id, 3) * YEAR),
      width: 10 + h(id, 4) * 25,
      season,
    });
  }
}
export const PROD: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/** procura relativa do produto num dia (0.15..~5) */
export function demand(p: Product, day: number): number {
  const d = ((day % YEAR) + YEAR) % YEAR;
  let dd = Math.abs(d - p.peak);
  dd = Math.min(dd, YEAR - dd);
  const bell = Math.exp(-(dd * dd) / (2 * p.width * p.width));
  let k = p.pop * (0.65 + 0.7 * bell);
  const s = seasonAt(day);
  if (s) {
    k *= s.boost[p.cat] ?? 1;
    if (s.all) k *= s.all;
    if (p.season === s.id) k *= 1.5;
  }
  return Math.max(0.15, k);
}

/** nível do jogo: o produto está liberado (com a licença da categoria comprada)? */
export function unlocked(p: Product, level: number, licenses: string[]): boolean {
  const c = CAT[p.cat];
  return level >= p.lvl && (c.price === 0 || licenses.includes(c.id));
}

/** preço formatado em "moedinhas Bloop" (B$) */
export function money(n: number): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = v >= 1000 ? Math.round(v).toLocaleString('pt-BR') : v.toFixed(2).replace('.', ',');
  return (neg ? '-' : '') + 'B$ ' + s;
}
