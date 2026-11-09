/* ============================================================
 *  PASSE MUSICAL (extensão do Passe Estelar) — Bloop Banda.
 *  Arquivos NOVOS apenas; não altera src/pass/*. Leve: não importa o
 *  sintetizador nem o catálogo de músicas (só ../../music/season-music-data).
 *
 *  Por temporada (60, dez/2026 → nov/2031), 50 níveis grátis + premium:
 *   - músicas do tema musical (grátis: 1; premium: 2 + MEGA no nível 50)
 *   - 2–3 AURAS animadas (drawAura), 2–3 DANÇAS (playDance), 5 skins de
 *     instrumento, 2 skins de pista de notas e 1 variante de palco.
 *  Inicial grátis (todo mundo): 3 danças + 2 auras (STARTER).
 *
 *  O QUE O LÍDER PRECISA LIGAR (hook mínimo):
 *   1. No passe: mostrar `musicPassSeason(i).levels` como trilha extra (ou
 *      mesclar), e ao resgatar chamar `grantMusicReward(r)` → devolve o item
 *      para o inventário (salvar ids em save.music.owned, por exemplo).
 *   2. Hub/jogo: `drawAura(ctx, id, x, y, R, t)` atrás do Bloop;
 *      `playDance(id)` + applyDancePose/drawDanceArms/drawDanceFx em volta
 *      do drawPlayer (ver dances.ts).
 *   3. Bloop Banda: músicas destravadas = SONGS grátis + ids recebidos
 *      (kind 'song'); skins via `instSkin(id)` / `highwaySkin(id)`; palco
 *      via `stageVariant(id)` (base = id de palco do jogo + cores).
 *   4. Textos: `musicItemName(r)` usa t('mpass.<id>', nome pt-BR).
 * ============================================================ */
import { SEASONS } from '../../creatures/seasons';
import { t } from '../../i18n';
import { seasonMusicText, seasonSongIds } from '../../music/season-music-data';
import { AURA_FAMILIES, AURA_FAMILY_NAME, registerAura, type AuraDef, type AuraFamily } from './auras';
import { FX_KINDS, MOVE_KINDS, MOVE_NAME, registerDance, type DanceDef, type FxKind, type Move, type MoveKind } from './dances';

export * from './auras';
export * from './dances';

export type MusicRewardKind = 'song' | 'aura' | 'dance' | 'instSkin' | 'highway' | 'stage' | 'coins' | 'gems' | 'tickets';
export type MusicRarity = 'common' | 'medio' | 'rare' | 'epic' | 'legendary';
export interface MusicReward {
  kind: MusicRewardKind;
  id: string; // vazio para moedas/gemas/ingressos
  amount: number;
  name: string;
  rarity: MusicRarity;
}
export interface MusicPassLevel {
  level: number;
  free: MusicReward | null;
  prem: MusicReward;
}

export type GameInstrument = 'drums' | 'bass' | 'guitar' | 'keys' | 'vocals';
export interface InstSkin {
  id: string;
  inst: GameInstrument;
  name: string;
  colors: [string, string, string]; // corpo, destaque, detalhe
  pattern: 'solid' | 'stripes' | 'stars' | 'flames' | 'checker' | 'dots' | 'waves' | 'pixel' | 'scales' | 'gems' | 'lightning' | 'hearts';
  finish: 'gloss' | 'matte' | 'metal' | 'neon';
}
export interface HighwaySkin {
  id: string;
  name: string;
  bg: [string, string];
  line: string;
  lanes: string[]; // 5 cores de pista
  pattern: 'grid' | 'stars' | 'waves' | 'hex' | 'stripes' | 'bubbles' | 'pixels' | 'flames' | 'snow' | 'notes' | 'circuits' | 'petals';
  scroll: number; // velocidade do padrão (multiplicador)
  glow: number; // 0..1
}
export interface StageVariant {
  id: string;
  base: string; // id do palco do jogo ('arena', 'praia', ...)
  name: string;
  sky: [string, string];
  light: string;
  props: string[];
}
export interface MusicPassSeason {
  season: number;
  theme: string; // tema musical
  style: string;
  songs: string[];
  mega: string;
  auras: AuraDef[];
  dances: DanceDef[];
  instSkins: InstSkin[];
  highways: HighwaySkin[];
  stage: StageVariant;
  levels: MusicPassLevel[];
}

const NN = (i: number) => String(i).padStart(2, '0');
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function hx(h: string): [number, number, number] {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, k: number): string {
  const A = hx(a);
  const B = hx(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/* ---------------- afinidades tema → famílias/partículas ---------------- */
const AFFINITY: [RegExp, AuraFamily, FxKind][] = [
  [/Natal|Inverno|Neve|Pinguim|Polar|Aurora/i, 'snow', 'flake'],
  [/Ano Novo|Carnaval|Festa|Aniversário|Circo|Parque/i, 'confetti', 'confetti'],
  [/Mar|Abissal|Marinhos|Gelatina|Mergulho/i, 'bubbles', 'bubble'],
  [/Pixel|Brinquedo|Laborat/i, 'pixels', 'pixel'],
  [/Robô|Steampunk|Agentes|Turbo/i, 'bolt', 'spark'],
  [/Vulc|Dragõ|Lava|Junina|Lanternas/i, 'flame', 'flame'],
  [/Doces|Pijama|Fadas|Cozinha|Alien/i, 'hearts', 'heart'],
  [/Selva|Jardim|Bosque|Cogumelos|Insetos|Ilha/i, 'petals', 'leaf'],
  [/Música|Esportes|Heróis|Copa|Olimp/i, 'eq', 'note'],
  [/Castelo|Realeza|Mitologia|Lendas|Cristais|Bruxinhos/i, 'halo', 'star'],
];

const FREE_AURAS: AuraDef[] = [
  { id: 'mpa_free_1', name: 'Anel do Iniciante', family: 'ring', colors: ['#5ef0ff', '#ff5cc8', '#ffffff'], count: 8, speed: 1, spin: 1, rarity: 'rare' },
  { id: 'mpa_free_2', name: 'Notinhas Amigas', family: 'notes', colors: ['#ffe14f', '#7dfcff', '#ffffff'], count: 5, speed: 0.8, spin: 1, rarity: 'rare' },
];
const FREE_DANCES: DanceDef[] = [
  { id: 'mpd_free_1', name: 'Pula-Pula Básico', bpm: 120, moves: [{ k: 'hop', beats: 4, amp: 1 }, { k: 'squash', beats: 4, amp: 1 }], fx: 'star', fxEvery: 4, colors: ['#ffe14f', '#ffffff'], rarity: 'medio' },
  { id: 'mpd_free_2', name: 'Balancinho Feliz', bpm: 110, moves: [{ k: 'sway', beats: 4, amp: 1 }, { k: 'wave', beats: 4, amp: 1 }], fx: 'note', fxEvery: 2, colors: ['#7dfcff', '#ff5cc8'], rarity: 'medio' },
  { id: 'mpd_free_3', name: 'Palminha no Ritmo', bpm: 120, moves: [{ k: 'clap', beats: 4, amp: 1 }, { k: 'bounce', beats: 4, amp: 1 }], fx: 'spark', fxEvery: 1, colors: ['#ffffff', '#ffb347'], rarity: 'medio' },
];
export const STARTER = { auras: FREE_AURAS.map((a) => a.id), dances: FREE_DANCES.map((d) => d.id) };
FREE_AURAS.forEach(registerAura);
FREE_DANCES.forEach(registerDance);

const INSTS: GameInstrument[] = ['guitar', 'drums', 'bass', 'keys', 'vocals'];
const INST_NAME: Record<GameInstrument, string> = { guitar: 'Guitarra', drums: 'Bateria', bass: 'Baixo', keys: 'Teclado', vocals: 'Microfone' };
const PATTERNS: InstSkin['pattern'][] = ['stripes', 'stars', 'flames', 'checker', 'dots', 'waves', 'pixel', 'scales', 'gems', 'lightning', 'hearts', 'solid'];
const FINISH: InstSkin['finish'][] = ['gloss', 'matte', 'metal', 'neon'];
const HW_PAT: HighwaySkin['pattern'][] = ['grid', 'stars', 'waves', 'hex', 'stripes', 'bubbles', 'pixels', 'flames', 'snow', 'notes', 'circuits', 'petals'];
const STAGE_PROPS: [RegExp, string[]][] = [
  [/Natal|Inverno|Neve|Pinguim|Polar|Aurora/i, ['neve', 'luzinhas', 'pinheiros']],
  [/Ano Novo|Festa|Aniversário|Parque|Circo/i, ['balões', 'fogos', 'serpentinas']],
  [/Carnaval|Olimp|Copa/i, ['carro-alegórico', 'confete', 'bandeiras']],
  [/Mar|Abissal|Marinhos|Ilha/i, ['bolhas', 'corais', 'peixinhos']],
  [/Junina/i, ['bandeirinhas', 'fogueira', 'balão-de-papel']],
  [/Pixel|Brinquedo|Laborat|Alien/i, ['blocos', 'moedas', 'tubos']],
  [/Robô|Steampunk|Turbo|Agentes/i, ['engrenagens', 'holofotes', 'fumaça']],
  [/Vulc|Dragõ|Lava/i, ['lava', 'faíscas', 'rochas']],
  [/Castelo|Realeza|Mitologia|Lendas|Bruxinhos|Cristais/i, ['estandartes', 'cristais', 'velas']],
  [/Selva|Jardim|Bosque|Cogumelos|Insetos/i, ['folhas', 'vagalumes', 'cogumelos']],
];

const SEASON_CACHE = new Map<number, MusicPassSeason>();
let built = false;
/** gera todas (barato) uma vez, garantindo unicidade global de danças */
function buildAll(): void {
  if (built) return;
  built = true;
  const usedDance = new Set<string>(FREE_DANCES.map(danceSig));
  for (let i = 0; i < SEASONS.length; i++) SEASON_CACHE.set(i, buildSeason(i, usedDance));
}

export function danceSig(d: DanceDef): string {
  return d.moves.map((m) => `${m.k}${m.beats}`).join('-') + '/' + d.fx;
}
export function auraSig(a: AuraDef): string {
  return `${a.family}/${a.colors.join(',')}`;
}

function buildSeason(i: number, usedDance: Set<string>): MusicPassSeason {
  const S = SEASONS[i];
  const txt = seasonMusicText(i);
  const ids = seasonSongIds(i);
  const r = rng(0x5eed + i * 7919);
  const [bg, c1, c2] = S.palette;
  const aff = AFFINITY.find(([re]) => re.test(S.theme));
  const nAura = i % 2 === 0 ? 3 : 2;
  const nDance = i % 3 === 1 ? 2 : 3;
  // auras
  const fams: AuraFamily[] = [];
  if (aff) fams.push(aff[1]);
  let rot = (i * 5) % AURA_FAMILIES.length;
  while (fams.length < nAura) {
    const f = AURA_FAMILIES[rot++ % AURA_FAMILIES.length];
    if (!fams.includes(f)) fams.push(f);
  }
  const auras: AuraDef[] = fams.map((f, k) => {
    const cols: [string, string, string] = k === 0 ? [c1, c2, '#ffffff'] : k === 1 ? [c2, c1, mix(c1, '#ffffff', 0.6)] : [mix(c1, c2, 0.5), '#ffffff', c2];
    const a: AuraDef = {
      id: `mpa_s${NN(i)}_${k + 1}`,
      name: `${AURA_FAMILY_NAME[f]}: ${S.theme}`,
      family: f,
      colors: cols,
      count: 6 + Math.floor(r() * 8),
      speed: 0.7 + r() * 0.8,
      spin: r() < 0.5 ? 1 : -1,
      rarity: k === nAura - 1 ? 'legendary' : k === 0 ? 'rare' : 'epic',
    };
    registerAura(a);
    return a;
  });
  // danças (únicas em 5 anos)
  const dances: DanceDef[] = [];
  const firstUsed = new Set<MoveKind>();
  for (let k = 0; k < nDance; k++) {
    let def: DanceDef | null = null;
    for (let tries = 0; tries < 200 && !def; tries++) {
      const nm = 2 + Math.floor(r() * 3); // 2..4 passos
      const moves: Move[] = [];
      let left = 8;
      for (let m = 0; m < nm; m++) {
        const beats = m === nm - 1 ? left : Math.min(left - (nm - m - 1) * 2, r() < 0.5 ? 2 : 4);
        if (beats <= 0) break;
        let kind = MOVE_KINDS[Math.floor(r() * MOVE_KINDS.length)];
        if (m === 0 && firstUsed.has(kind)) continue;
        if (moves.length && moves[moves.length - 1].k === kind) kind = MOVE_KINDS[(MOVE_KINDS.indexOf(kind) + 3) % MOVE_KINDS.length];
        moves.push({ k: kind, beats, amp: Math.round((0.8 + r() * 0.5) * 100) / 100 });
        left -= beats;
      }
      if (left !== 0 || moves.length < 2) continue;
      const fx = k === 0 && aff ? aff[2] : FX_KINDS[Math.floor(r() * FX_KINDS.length)];
      const cand: DanceDef = {
        id: `mpd_s${NN(i)}_${k + 1}`,
        name: `${MOVE_NAME[moves[0].k]}: ${S.theme}`,
        bpm: 100 + Math.floor(r() * 30),
        moves,
        fx,
        fxEvery: [1, 2, 4][Math.floor(r() * 3)],
        colors: [c1, c2],
        rarity: k === nDance - 1 ? 'legendary' : k === 0 ? 'rare' : 'epic',
      };
      if (usedDance.has(danceSig(cand))) continue;
      usedDance.add(danceSig(cand));
      firstUsed.add(moves[0].k);
      def = cand;
    }
    registerDance(def!);
    dances.push(def!);
  }
  // skins de instrumento
  const instSkins: InstSkin[] = INSTS.map((inst, k) => ({
    id: `mpi_s${NN(i)}_${inst}`,
    inst,
    name: `${INST_NAME[inst]} ${S.theme}`,
    colors: k % 2 ? [c2, c1, '#ffffff'] : [c1, c2, mix(bg, '#ffffff', 0.15)],
    pattern: PATTERNS[(i * 3 + k) % PATTERNS.length],
    finish: FINISH[(i + k) % FINISH.length],
  }));
  const highways: HighwaySkin[] = [0, 1].map((k) => ({
    id: `mph_s${NN(i)}_${k + 1}`,
    name: `Pista ${k ? 'Brilhante' : 'Clássica'}: ${S.theme}`,
    bg: k ? [mix(bg, c1, 0.25), bg] : [bg, mix(bg, '#000000', 0.4)],
    line: k ? c2 : c1,
    lanes: [c1, c2, mix(c1, c2, 0.5), mix(c1, '#ffffff', 0.4), mix(c2, '#ffffff', 0.4)],
    pattern: HW_PAT[(i * 2 + k + Math.floor(i / 12)) % HW_PAT.length],
    scroll: k ? 1.4 : 1,
    glow: k ? 0.9 : 0.5,
  }));
  const props = STAGE_PROPS.find(([re]) => re.test(S.theme))?.[1] ?? ['holofotes', 'estrelas', 'telão'];
  const stage: StageVariant = { id: `mps_s${NN(i)}`, base: txt.stage, name: `Palco ${S.theme}`, sky: [bg, mix(bg, c1, 0.35)], light: c1, props };

  // ---------------- níveis ----------------
  const songR = (id: string, title: string, rar: MusicRarity): MusicReward => ({ kind: 'song', id, amount: 1, name: title, rarity: rar });
  const it = (kind: MusicRewardKind, id: string, name: string, rarity: MusicRarity): MusicReward => ({ kind, id, amount: 1, name, rarity });
  const prem = new Map<number, MusicReward>();
  prem.set(1, it('aura', auras[0].id, auras[0].name, auras[0].rarity));
  prem.set(5, it('dance', dances[0].id, dances[0].name, dances[0].rarity));
  prem.set(10, songR(ids.songs[1], txt.titles[1], 'epic'));
  prem.set(12, it('instSkin', instSkins[0].id, instSkins[0].name, 'rare'));
  prem.set(15, it('highway', highways[0].id, highways[0].name, 'rare'));
  prem.set(18, it('instSkin', instSkins[1].id, instSkins[1].name, 'rare'));
  prem.set(20, it('dance', dances[1].id, dances[1].name, dances[1].rarity));
  prem.set(22, it('instSkin', instSkins[2].id, instSkins[2].name, 'rare'));
  prem.set(25, it('aura', auras[1].id, auras[1].name, auras[1].rarity));
  prem.set(28, it('instSkin', instSkins[3].id, instSkins[3].name, 'epic'));
  prem.set(30, songR(ids.songs[2], txt.titles[2], 'epic'));
  prem.set(32, it('instSkin', instSkins[4].id, instSkins[4].name, 'epic'));
  prem.set(35, it('stage', stage.id, stage.name, 'epic'));
  prem.set(38, it('highway', highways[1].id, highways[1].name, 'epic'));
  if (dances[2]) prem.set(40, it('dance', dances[2].id, dances[2].name, dances[2].rarity));
  if (auras[2]) prem.set(45, it('aura', auras[2].id, auras[2].name, auras[2].rarity));
  prem.set(50, songR(ids.mega, `MEGA: ${txt.megaTitle}`, 'legendary'));
  const filler = (lv: number): MusicReward => {
    const k = lv % 3;
    return k === 0 ? { kind: 'gems', id: '', amount: 10 + Math.floor(lv / 10) * 5, name: 'Gemas', rarity: 'medio' } : k === 1 ? { kind: 'coins', id: '', amount: 150 + lv * 10, name: 'Moedas', rarity: 'common' } : { kind: 'tickets', id: '', amount: 1, name: 'Ingresso', rarity: 'common' };
  };
  const levels: MusicPassLevel[] = [];
  for (let lv = 1; lv <= 50; lv++) {
    let free: MusicReward | null = null;
    if (lv === 10) free = songR(ids.songs[0], txt.titles[0], 'rare');
    else if (lv % 5 === 0 || lv === 1) free = filler(lv + 1);
    levels.push({ level: lv, free, prem: prem.get(lv) ?? filler(lv) });
  }
  return { season: i, theme: txt.theme, style: txt.style, songs: ids.songs, mega: ids.mega, auras, dances, instSkins, highways, stage, levels };
}

/** conteúdo do Passe Musical da temporada `i` (0..59) */
export function musicPassSeason(i: number): MusicPassSeason {
  buildAll();
  return SEASON_CACHE.get(i)!;
}
export function allMusicPassSeasons(): MusicPassSeason[] {
  buildAll();
  return [...SEASON_CACHE.values()];
}

const lookup = <T extends { id: string }>(pick: (s: MusicPassSeason) => T[]) => (id: string): T | undefined => {
  buildAll();
  const m = /_s(\d\d)/.exec(id) ?? /^mps_s(\d\d)/.exec(id);
  if (!m) return undefined;
  return pick(SEASON_CACHE.get(Number(m[1]))!).find((x) => x.id === id);
};
export const instSkin = lookup((s) => s.instSkins);
export const highwaySkin = lookup((s) => s.highways);
export const stageVariant = (id: string): StageVariant | undefined => {
  buildAll();
  const m = /^mps_s(\d\d)$/.exec(id);
  return m ? SEASON_CACHE.get(Number(m[1]))?.stage : undefined;
};

/** força o registro das auras/danças (para drawAura/playDance acharem os ids) */
export function ensureMusicPassRegistered(): void {
  buildAll();
}

/** nome traduzível do item */
export function musicItemName(r: MusicReward): string {
  if (!r.id) return t(`mpass.kind.${r.kind}`, r.name);
  return t(`mpass.${r.id}`, r.name);
}

/** HOOK mínimo para o passe: recompensas de um nível (null = nada naquela trilha) */
export function musicRewardsForLevel(season: number, level: number): { free: MusicReward | null; prem: MusicReward } | null {
  const s = musicPassSeason(season);
  return s?.levels[level - 1] ?? null;
}

/** HOOK: o que fazer ao resgatar — devolve o id a guardar no inventário (ou null para moedas etc.) */
export function grantMusicReward(r: MusicReward): { inventory: MusicRewardKind; id: string } | null {
  return r.id ? { inventory: r.kind, id: r.id } : null;
}

/** verificação: nada se repete em 5 anos (ids, nomes, assinaturas) — usado pelo script de dev */
export function verifyMusicPass(): string[] {
  buildAll();
  const errs: string[] = [];
  const seen = new Map<string, string>();
  const chk = (k: string, what: string) => {
    if (seen.has(k)) errs.push(`repetido: ${what} (${k}) = ${seen.get(k)}`);
    else seen.set(k, what);
  };
  for (const a of FREE_AURAS) chk('aura:' + auraSig(a), a.id);
  for (const d of FREE_DANCES) chk('dance:' + danceSig(d), d.id);
  for (const s of SEASON_CACHE.values()) {
    for (const a of s.auras) {
      chk('id:' + a.id, a.id);
      chk('name:' + a.name, a.id);
      chk('aura:' + auraSig(a), a.id);
    }
    for (const d of s.dances) {
      chk('id:' + d.id, d.id);
      chk('name:' + d.name, d.id);
      chk('dance:' + danceSig(d), d.id);
    }
    for (const x of s.instSkins) {
      chk('id:' + x.id, x.id);
      chk(`inst:${x.inst}/${x.pattern}/${x.colors.join()}`, x.id);
    }
    for (const h of s.highways) {
      chk('id:' + h.id, h.id);
      chk(`hw:${h.pattern}/${h.bg.join()}/${h.line}`, h.id);
    }
    chk('id:' + s.stage.id, s.stage.id);
    if (s.levels.length !== 50) errs.push(`${s.season}: ${s.levels.length} níveis`);
    const songsFree = s.levels.filter((l) => l.free?.kind === 'song').length;
    const songsPrem = s.levels.filter((l) => l.prem.kind === 'song').length;
    if (songsFree !== 1 || songsPrem !== 3) errs.push(`${s.season}: músicas grátis ${songsFree} premium ${songsPrem}`);
  }
  return errs;
}
