/* ============================================================
 *  CRIE SEU BLOOP — catálogo de peças + desenho do avatar.
 *  As peças grátis são de propósito toscas (giz de cera, pontinhos
 *  tortos, saco de papel); as compradas vão ficando lindas.
 *  drawAvatar segue as convenções de drawPlayer (character.ts).
 * ============================================================ */
import { save } from '../core/storage';
import { t } from '../i18n';
import type { PlayerPose } from './character';
import { A, cols, ell, lum, mix, NP, setBase, SHAPES, tracePts } from './avatar-gfx';
import { drawOutline, type DC, MATERIALS, PATTERNS, shadeBody } from './avatar-mat';
import { AURAS, BACKS, EYES, FACES, HEADS, MOUTHS } from './avatar-parts';
import { RARITY_INFO, SKINS, type Price, type Rarity } from './skins';
// EXTENSÃO: peças exclusivas do Passe Estelar (olhos/bocas/auras por temporada)
import { installPassParts, isPassPart, PASS_PARTS } from '../pass/parts';
installPassParts(EYES, MOUTHS, AURAS);

export type Slot = 'body' | 'material' | 'pattern' | 'eyes' | 'mouth' | 'head' | 'face' | 'back' | 'aura';
export type PartSlot = Slot | 'palette';

export const SLOTS: Slot[] = ['body', 'material', 'pattern', 'eyes', 'mouth', 'head', 'face', 'back', 'aura'];

export const SLOT_LABEL: Record<PartSlot, string> = {
  get body() { return t('slot.body', 'Corpo'); },
  get material() { return t('slot.material', 'Cor'); },
  get pattern() { return t('slot.pattern', 'Padrão'); },
  get eyes() { return t('slot.eyes', 'Olhos'); },
  get mouth() { return t('slot.mouth', 'Boca'); },
  get head() { return t('slot.head', 'Cabeça'); },
  get face() { return t('slot.face', 'Rosto'); },
  get back() { return t('slot.back', 'Costas'); },
  get aura() { return t('slot.aura', 'Aura'); },
  get palette() { return t('slot.palette', 'Paleta'); },
};

export interface Part {
  id: string;
  slot: PartSlot;
  name: string;
  rarity: Rarity;
  price: Price;
  /** paletas: cores disponíveis */
  colors?: string[];
  desc?: string;
}

export interface AvatarData {
  parts: Record<Slot, string>;
  colors: { primary: string; secondary: string };
}

const P = (id: string, slot: PartSlot, name: string, rarity: Rarity, price: Price, desc?: string): Part => ({ id, slot, name, rarity, price, desc });
const FREE: Price = {};

export const PARTS: Part[] = [
  /* ---------------- CORPO ---------------- */
  P('b_blob', 'body', 'Batata Torta', 'common', FREE, 'Feito às pressas. Bem às pressas.'),
  P('b_round', 'body', 'Bolinha', 'common', { coins: 150 }, 'Redondinho, o clássico.'),
  P('b_bean', 'body', 'Feijão', 'common', { coins: 300 }),
  P('b_egg', 'body', 'Ovinho', 'common', { ads: 2 }),
  P('b_cloud', 'body', 'Nuvem', 'rare', { coins: 900 }),
  P('b_drop', 'body', 'Gota', 'rare', { coins: 1100 }),
  P('b_square', 'body', 'Quadradinho Fofo', 'rare', { coins: 1300 }),
  P('b_cat', 'body', 'Orelhudo', 'rare', { ads: 5 }),
  P('b_heart', 'body', 'Coração', 'epic', { gems: 45 }),
  P('b_star', 'body', 'Estrela', 'epic', { gems: 55 }),
  P('b_ghost', 'body', 'Fantasminha', 'epic', { gems: 70 }, 'Flutua com a barra ondulando.'),
  P('b_gem', 'body', 'Lapidado', 'legendary', { gems: 120 }),

  /* ---------------- COR / MATERIAL ---------------- */
  P('m_crayon', 'material', 'Giz de Cera', 'common', FREE, 'Pintado fora da linha.'),
  P('m_clay', 'material', 'Massinha', 'common', { coins: 200 }),
  P('m_soft', 'material', 'Brilho Suave', 'common', { coins: 500 }, 'Luz e sombra de verdade.'),
  P('m_duo', 'material', 'Dois Tons', 'rare', { coins: 900 }),
  P('m_plush', 'material', 'Pelúcia', 'rare', { coins: 1400 }),
  P('m_jelly', 'material', 'Bala de Goma', 'rare', { ads: 4 }),
  P('m_pearl', 'material', 'Pérola', 'epic', { gems: 45 }),
  P('m_metal', 'material', 'Cromado', 'epic', { gems: 55 }),
  P('m_ice', 'material', 'Gelo Cristal', 'epic', { coins: 4500 }),
  P('m_neon', 'material', 'Neon', 'epic', { ads: 8 }),
  P('m_gold', 'material', 'Ouro Maciço', 'legendary', { gems: 150 }),
  P('m_holo', 'material', 'Holográfico', 'legendary', { gems: 180 }),
  P('m_lava', 'material', 'Lava Viva', 'legendary', { gems: 200 }),
  P('m_galaxy', 'material', 'Galáxia', 'mythic', { iap: 'part_galaxy' }, 'Um universo inteiro no seu Bloop.'),
  P('m_aurora', 'material', 'Aurora Boreal', 'mythic', { event: 'challenge' }, 'Exclusivo de evento.'),

  /* ---------------- PADRÃO ---------------- */
  P('p_none', 'pattern', 'Liso', 'common', FREE),
  P('p_doodle', 'pattern', 'Rabisco', 'common', FREE, 'Arte moderna. Eu acho.'),
  P('p_spots', 'pattern', 'Pintinhas', 'common', { coins: 200 }),
  P('p_belly', 'pattern', 'Barriguinha', 'common', { coins: 250 }),
  P('p_stripes', 'pattern', 'Listras', 'common', { coins: 400 }),
  P('p_patches', 'pattern', 'Vaquinha', 'rare', { coins: 800 }),
  P('p_hearts', 'pattern', 'Coraçõezinhos', 'rare', { ads: 3 }),
  P('p_stars', 'pattern', 'Estrelinhas', 'rare', { coins: 1100 }),
  P('p_tiger', 'pattern', 'Tigrado', 'epic', { gems: 35 }),
  P('p_scales', 'pattern', 'Escamas', 'epic', { gems: 50 }),
  P('p_circuit', 'pattern', 'Circuitos', 'legendary', { gems: 110 }),
  P('p_runes', 'pattern', 'Runas Mágicas', 'legendary', { gems: 130 }),
  P('p_cracks', 'pattern', 'Rachaduras de Luz', 'mythic', { event: 'challenge' }, 'Exclusivo de evento.'),

  /* ---------------- OLHOS ---------------- */
  P('e_dots', 'eyes', 'Pontinhos Tortos', 'common', FREE, 'Um maior que o outro. Charme.'),
  P('e_derp', 'eyes', 'Olho de Plástico', 'common', FREE),
  P('e_cute', 'eyes', 'Fofinhos', 'common', { coins: 300 }),
  P('e_sleepy', 'eyes', 'Sonolento', 'common', { coins: 450 }),
  P('e_angry', 'eyes', 'Bravinho', 'rare', { coins: 900 }),
  P('e_big', 'eyes', 'Brilhantes', 'rare', { coins: 1200 }),
  P('e_cyclops', 'eyes', 'Ciclope', 'rare', { ads: 4 }),
  P('e_heart', 'eyes', 'Apaixonado', 'epic', { ads: 7 }),
  P('e_star', 'eyes', 'Olhos de Estrela', 'epic', { gems: 40 }),
  P('e_robot', 'eyes', 'LED Robô', 'epic', { gems: 50 }),
  P('e_visor', 'eyes', 'Visor Cyber', 'legendary', { gems: 120 }),
  P('e_fire', 'eyes', 'Olhos de Fogo', 'legendary', { gems: 150 }),
  P('e_galaxy', 'eyes', 'Olhar Cósmico', 'mythic', { event: 'challenge' }, 'Exclusivo de evento.'),

  /* ---------------- BOCA ---------------- */
  P('mo_line', 'mouth', 'Risco Torto', 'common', FREE, 'Desenhado com a mão esquerda.'),
  P('mo_tooth', 'mouth', 'Dentuço', 'common', FREE),
  P('mo_smile', 'mouth', 'Sorrisinho', 'common', { coins: 250 }),
  P('mo_kiss', 'mouth', 'Biquinho', 'common', { ads: 2 }),
  P('mo_grin', 'mouth', 'Sorrisão', 'common', { coins: 500 }),
  P('mo_cat', 'mouth', 'Boquinha :3', 'rare', { coins: 700 }),
  P('mo_tongue', 'mouth', 'Língua de Fora', 'rare', { ads: 3 }),
  P('mo_fangs', 'mouth', 'Presinhas', 'rare', { coins: 1100 }),
  P('mo_beak', 'mouth', 'Bico', 'rare', { coins: 1300 }),
  P('mo_mustache', 'mouth', 'Bigodão', 'epic', { gems: 30 }),
  P('mo_robot', 'mouth', 'Grade Robô', 'epic', { gems: 40 }),
  P('mo_shark', 'mouth', 'Tubarão', 'epic', { gems: 50 }),
  P('mo_gold', 'mouth', 'Dente de Ouro', 'legendary', { gems: 100 }),

  /* ---------------- CABEÇA ---------------- */
  P('h_none', 'head', 'Nada', 'common', FREE),
  P('h_bag', 'head', 'Saco de Papel', 'common', FREE, 'Achado no lixo. Serviu.'),
  P('h_pot', 'head', 'Panela', 'common', { coins: 150 }),
  P('h_cap', 'head', 'Boné', 'common', { coins: 400 }),
  P('h_beanie', 'head', 'Gorro', 'common', { coins: 600 }),
  P('h_antenna', 'head', 'Antena', 'common', { ads: 2 }),
  P('h_cat', 'head', 'Orelhas de Gato', 'rare', { coins: 900 }),
  P('h_bow', 'head', 'Laço', 'rare', { coins: 800 }),
  P('h_horns', 'head', 'Chifrinhos', 'rare', { coins: 1200 }),
  P('h_headphones', 'head', 'Fones', 'rare', { coins: 1500 }),
  P('h_tophat', 'head', 'Cartola', 'epic', { gems: 40 }),
  P('h_unicorn', 'head', 'Chifre de Unicórnio', 'epic', { ads: 8 }),
  P('h_wizard', 'head', 'Chapéu de Mago', 'epic', { gems: 60 }),
  P('h_astro', 'head', 'Capacete Espacial', 'epic', { gems: 80 }),
  P('h_halo', 'head', 'Auréola', 'legendary', { gems: 110 }),
  P('h_crown', 'head', 'Coroa Real', 'legendary', { gems: 160 }),
  P('h_flame', 'head', 'Cabelo de Fogo', 'mythic', { iap: 'part_flame_hair' }, 'Chamas vivas que nunca apagam.'),
  P('h_laurel', 'head', 'Louros do Campeão', 'mythic', { event: 'challenge' }, 'Exclusivo de evento.'),

  /* ---------------- ROSTO ---------------- */
  P('f_none', 'face', 'Nada', 'common', FREE),
  P('f_bandaid', 'face', 'Curativo Torto', 'common', FREE),
  P('f_blush', 'face', 'Bochechas', 'common', { coins: 200 }),
  P('f_freckles', 'face', 'Sardas', 'common', { coins: 300 }),
  P('f_star', 'face', 'Estrelinha', 'rare', { ads: 3 }),
  P('f_scar', 'face', 'Cicatriz', 'rare', { coins: 800 }),
  P('f_glasses', 'face', 'Óculos Redondos', 'rare', { coins: 1000 }),
  P('f_shades', 'face', 'Óculos Escuros', 'rare', { coins: 1400 }),
  P('f_paint', 'face', 'Pintura de Guerra', 'epic', { coins: 3500 }),
  P('f_mask', 'face', 'Máscara de Herói', 'epic', { gems: 35 }),
  P('f_monocle', 'face', 'Monóculo', 'epic', { gems: 45 }),
  P('f_cyber', 'face', 'Implante Neon', 'legendary', { gems: 100 }),

  /* ---------------- COSTAS ---------------- */
  P('k_none', 'back', 'Nada', 'common', FREE),
  P('k_cardboard', 'back', 'Asas de Papelão', 'common', FREE, 'Voa? Não. Tenta? Sim.'),
  P('k_tail', 'back', 'Rabinho', 'common', { coins: 400 }),
  P('k_backpack', 'back', 'Mochilinha', 'common', { coins: 600 }),
  P('k_cape', 'back', 'Capa de Herói', 'rare', { coins: 1000 }),
  P('k_bat', 'back', 'Asas de Morcego', 'rare', { coins: 1400 }),
  P('k_jetpack', 'back', 'Jetpack', 'epic', { gems: 50 }),
  P('k_fairy', 'back', 'Asas de Fada', 'epic', { ads: 8 }),
  P('k_angel', 'back', 'Asas de Anjo', 'epic', { gems: 70 }),
  P('k_mech', 'back', 'Propulsores Mecha', 'legendary', { gems: 130 }),
  P('k_dragon', 'back', 'Asas de Dragão', 'legendary', { gems: 160 }),
  P('k_phoenix', 'back', 'Asas de Fênix', 'mythic', { iap: 'part_phoenix_wings' }, 'Asas de fogo de verdade.'),

  /* ---------------- AURA ---------------- */
  P('a_none', 'aura', 'Nada', 'common', FREE),
  P('a_flies', 'aura', 'Mosquinhas', 'common', FREE, 'Elas te acompanham. Sempre.'),
  P('a_bubbles', 'aura', 'Bolhas', 'common', { coins: 600 }),
  P('a_sparkle', 'aura', 'Brilhinhos', 'rare', { coins: 1000 }),
  P('a_hearts', 'aura', 'Corações', 'rare', { ads: 4 }),
  P('a_notes', 'aura', 'Notas Musicais', 'rare', { coins: 1300 }),
  P('a_moons', 'aura', 'Luas em Órbita', 'epic', { gems: 60 }),
  P('a_fire', 'aura', 'Anel de Fogo', 'legendary', { gems: 140 }),
  P('a_electric', 'aura', 'Elétrico', 'legendary', { gems: 160 }),
  P('a_galaxy', 'aura', 'Mini Galáxia', 'mythic', { event: 'challenge' }, 'Exclusivo de evento.'),
];

/* ---------------- PALETAS ---------------- */
const PAL = (id: string, name: string, rarity: Rarity, price: Price, colors: string[]): Part => ({ id, slot: 'palette', name, rarity, price, colors });
export const PALETTES: Part[] = [
  PAL('pal_dull', 'Giz Velho', 'common', FREE, ['#c9a3a3', '#a8b08f', '#b8a98f', '#8f99a8']),
  PAL('pal_pastel', 'Pastel', 'common', { coins: 300 }, ['#ffc2dc', '#c2e8ff', '#d4ffc9', '#fff3b0', '#e2ccff', '#ffffff']),
  PAL('pal_candy', 'Doceria', 'common', { coins: 600 }, ['#ff8fd8', '#ff5c8a', '#ffb36b', '#9dffcb', '#8fe9ff', '#b388ff']),
  PAL('pal_ocean', 'Oceano', 'rare', { coins: 900 }, ['#8fe9ff', '#2a9bff', '#2a6dff', '#1fd1b0', '#0a3d7a', '#e0fbff']),
  PAL('pal_forest', 'Floresta', 'rare', { ads: 3 }, ['#7dff9a', '#2ec765', '#0b6e3f', '#c9a050', '#8a5a32', '#f0e6c0']),
  PAL('pal_sunset', 'Pôr do Sol', 'rare', { coins: 1200 }, ['#ffe36b', '#ffaa1c', '#ff6a3d', '#ff3d7f', '#9b3dff', '#3a1a6b']),
  PAL('pal_br', 'Brasil', 'rare', { ads: 5 }, ['#1fbf4f', '#ffdf1f', '#2f5bff', '#ffffff']),
  PAL('pal_neon', 'Neon', 'epic', { gems: 40 }, ['#ff2bd6', '#00fff0', '#c6ff00', '#ff6a00', '#7a3dff', '#14142a']),
  PAL('pal_shadow', 'Sombras', 'epic', { gems: 50 }, ['#3a2f5c', '#1a1430', '#5a2a4a', '#b14dff', '#d27bff', '#07050f']),
  PAL('pal_jewel', 'Joias', 'epic', { gems: 60 }, ['#ff2e63', '#3fb8ff', '#3ee07a', '#b84dff', '#ffb300', '#00c2a8']),
  PAL('pal_metal', 'Metais', 'legendary', { gems: 100 }, ['#ffd23f', '#d8dce8', '#c87a4a', '#f2b8a8', '#4a5068', '#fff7d6']),
];

export const ALL_PARTS: Part[] = [...PARTS, ...PASS_PARTS, ...PALETTES];
const BY_ID = new Map(ALL_PARTS.map((p) => [p.id, p]));
export const partById = (id: string): Part | undefined => BY_ID.get(id);
/** nome traduzível da peça (chave part.<id>; peças do passe já vêm traduzidas do catálogo) */
export const partName = (p: Part): string => t(`part.${p.id}`, p.name);
/** Peças do passe só aparecem no criador depois de ganhas (são centenas, uma por temporada). */
export const partsOf = (slot: PartSlot): Part[] => ALL_PARTS.filter((p) => p.slot === slot && (!isPassPart(p) || save.ownedParts.includes(p.id)));

/** Produtos de dinheiro real (cadastrar no Play Console). */
export const PART_PRODUCTS: { id: string; part: string; fallbackPrice: string }[] = [
  { id: 'part_galaxy', part: 'm_galaxy', fallbackPrice: 'R$ 7,90' },
  { id: 'part_flame_hair', part: 'h_flame', fallbackPrice: 'R$ 9,90' },
  { id: 'part_phoenix_wings', part: 'k_phoenix', fallbackPrice: 'R$ 12,90' },
];

export const STARTER_AVATAR = (): AvatarData => ({
  parts: { body: 'b_blob', material: 'm_crayon', pattern: 'p_none', eyes: 'e_dots', mouth: 'mo_line', head: 'h_bag', face: 'f_bandaid', back: 'k_none', aura: 'a_none' },
  colors: { primary: '#c9a3a3', secondary: '#a8b08f' },
});

export const isFreePart = (p: Part): boolean => !p.price.coins && !p.price.gems && !p.price.ads && !p.price.iap && !p.price.event;

/** Raridade do visual = a peça mais rara equipada. */
export function avatarRarity(av: AvatarData): Rarity {
  let best = 0;
  for (const s of SLOTS) {
    const p = partById(av.parts[s]);
    if (p) best = Math.max(best, RARITY_INFO[p.rarity].order);
  }
  return (['common', 'rare', 'epic', 'legendary', 'mythic'] as Rarity[])[best];
}

/** 0..1 — "nível de estilo" (média das raridades equipadas). */
export function avatarStyle(av: AvatarData): number {
  let sum = 0;
  for (const s of SLOTS) {
    const p = partById(av.parts[s]);
    if (p) sum += RARITY_INFO[p.rarity].order + (isFreePart(p) ? 0 : 0.5);
  }
  return Math.min(1, sum / (SLOTS.length * 4));
}

/* ============================================================
 *  drawAvatar
 * ============================================================ */

const animPts = new Float32Array(NP * 2);
const D: DC = {
  x: null as unknown as CanvasRenderingContext2D,
  R: 0,
  p: null as unknown as PlayerPose,
  c: cols('#c9a3a3', '#a8b08f'),
  sh: SHAPES.b_round,
  pts: SHAPES.b_round.pts,
  t: 0,
  ex: 0,
  ey: 0,
  my: 0,
};

/** Desenha o avatar centrado em (0,0) — mesmas convenções de drawPlayer. */
export function drawAvatar(x: CanvasRenderingContext2D, av: AvatarData, R: number, p: PlayerPose): void {
  const parts = av.parts;
  const sh = SHAPES[parts.body] ?? SHAPES.b_blob;
  const mat = MATERIALS[parts.material] ?? MATERIALS.m_crayon;
  const pat = PATTERNS[parts.pattern] ?? PATTERNS.p_none;
  const calm = (p.mood === 'idle' || p.mood === 'happy') && !p.still;
  const br = calm ? Math.sin(p.t * 2.6) * 0.035 : 0;
  let pts = sh.pts;
  if (sh.anim) {
    sh.anim(p.t, animPts);
    pts = animPts;
  }
  const d = D;
  d.x = x;
  d.R = R;
  d.p = p;
  let c = cols(av.colors.primary, av.colors.secondary);
  if (mat.skin && lum(mat.skin(c)) < 0.3) c = cols(av.colors.primary, av.colors.secondary, true);
  d.c = c;
  d.sh = sh;
  d.pts = pts;
  d.t = p.t;
  d.ex = R * 0.33 * Math.min(1.15, Math.max(0.9, sh.side));
  d.ey = R * (sh.fy - 0.1);
  d.my = R * (sh.fy + 0.25);
  const base = x.globalAlpha;
  setBase(base);

  x.save();
  x.scale(p.sx * (1 + br), p.sy * (1 - br));
  if (br) x.translate(0, R * br);
  x.lineCap = 'round';
  x.lineJoin = 'round';

  (AURAS[parts.aura] ?? AURAS.a_none)(d, 0);
  (BACKS[parts.back] ?? BACKS.k_none)(d, 0);
  if (mat.under) mat.under(d);

  // pezinhos
  if (p.mood !== 'fly' && sh.feet) {
    const [f0, f1] = mat.feet ? mat.feet(d.c) : [d.c.Pd, d.c.Ph];
    const fy = sh.bottom * R * 0.88;
    for (const s of [-1, 1]) {
      x.fillStyle = f0;
      ell(x, s * R * 0.42, fy, R * 0.28, R * 0.18);
      x.fill();
      if (mat.outline === 'marker') {
        x.strokeStyle = '#2a2420';
        x.lineWidth = R * 0.06;
        x.stroke();
      } else {
        x.fillStyle = f1;
        A(x, 0.55);
        ell(x, s * R * 0.42 - R * 0.06, fy - R * 0.06, R * 0.12, R * 0.06);
        x.fill();
        A(x, 1);
      }
    }
  }

  // corpo
  tracePts(x, pts, R, sh.sharp);
  x.save();
  x.clip();
  mat.fill(d);
  pat.draw(d);
  shadeBody(d, mat.shade, mat.spec ?? 1);
  if (mat.over) mat.over(d);
  if (sh.sharp && parts.body === 'b_gem') gemFacets(d);
  x.restore();
  drawOutline(d, mat);

  // rosto
  const face = FACES[parts.face] ?? FACES.f_none;
  face(d, 0);
  (EYES[parts.eyes] ?? EYES.e_dots)(d);
  (MOUTHS[parts.mouth] ?? MOUTHS.mo_line)(d);
  face(d, 1);
  (BACKS[parts.back] ?? BACKS.k_none)(d, 1);

  // cabeça
  const head = HEADS[parts.head] ?? HEADS.h_none;
  const hy = -sh.top * R;
  x.save();
  x.translate(0, sh.top * R);
  head(d, hy);
  x.restore();

  (AURAS[parts.aura] ?? AURAS.a_none)(d, 1);
  x.restore();
  x.globalAlpha = base;
}

function gemFacets(d: DC): void {
  const { x, R, pts } = d;
  x.strokeStyle = '#ffffff';
  x.lineWidth = R * 0.025;
  A(x, 0.3);
  x.beginPath();
  for (let i = 0; i < NP; i += 8) {
    x.moveTo(pts[i * 2] * R, pts[i * 2 + 1] * R);
    x.lineTo(pts[i * 2] * R * 0.55, pts[i * 2 + 1] * R * 0.55);
  }
  x.stroke();
  x.fillStyle = '#ffffff';
  A(x, 0.12);
  x.beginPath();
  for (let i = 0; i < NP; i += 8) {
    const px = pts[i * 2] * R * 0.55;
    const py = pts[i * 2 + 1] * R * 0.55;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.closePath();
  x.fill();
  A(x, 1);
}

/* ============================================================
 *  posse + sincronização com a skin especial "custom"
 * ============================================================ */

export function ownsPart(id: string): boolean {
  const p = partById(id);
  if (!p) return false;
  return isFreePart(p) || save.ownedParts.includes(id);
}

/** Uma cor é "sua" se estiver em alguma paleta possuída. */
export function ownsColor(hex: string): boolean {
  return PALETTES.some((p) => ownsPart(p.id) && p.colors!.includes(hex));
}

/** Atualiza cores/raridade da skin 'custom' (usadas pelo jogo em partículas e brilho). */
export function syncCustomSkin(av: AvatarData = save.avatar): void {
  const sk = SKINS.find((s) => s.id === 'custom');
  if (!sk) return;
  const mat = MATERIALS[av.parts.material];
  const c = cols(av.colors.primary, av.colors.secondary);
  const light = mat?.skin ? mat.skin(c) : av.colors.primary;
  sk.light = light.length === 7 ? mix(light, '#ffffff', 0.15) : av.colors.primary;
  sk.dark = c.Pd;
  sk.belly = c.Ph;
  sk.accent = av.colors.secondary;
  sk.rarity = avatarRarity(av);
}
