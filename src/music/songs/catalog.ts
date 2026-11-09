/* ============================================================
 *  CATÁLOGO do Bloop Banda — 20 grátis + 60 temporadas × (3 + MEGA).
 *  Todas as músicas, títulos e bandas são ORIGINAIS e FICTÍCIOS
 *  (nenhuma referência a músicas/artistas reais). Só metadados aqui;
 *  a composição e os charts são gerados sob demanda (index.ts).
 * ============================================================ */
import type { MegaTune, SongSpec } from './compose';
import { hash, planSections, rng } from './compose';
import { STYLES, type ModeId, type StyleId } from './styles';
import { MEGA, SEASON_MUSIC } from '../season-music-data';

export interface CatalogEntry {
  spec: SongSpec;
  title: string;
  band: string;
  tier: 'free' | 'pass' | 'mega';
  season?: number;
  stage: string;
  bars: number;
  durationSec: number;
}

const NN = (i: number) => String(i).padStart(2, '0');

/* ---------------------------- grátis ---------------------------- */
// id | título | banda | estilo | bpm | tônica | modo | fácil | palco
const FREE: [string, string, StyleId, number, number, ModeId, boolean, string][] = [
  ['Bloop, Bloop, Pula!', 'Os Bloopinhos', 'pop', 100, 0, 'ionian', true, 'palco-pop'],
  ['Minha Primeira Guitarra', 'Garagem dos Gatinhos', 'rock-arena', 110, 7, 'mixolydian', true, 'garagem'],
  ['Tambor de Lata', 'Turma da Panela', 'samba', 96, 5, 'ionian', true, 'carnaval'],
  ['Robô Dançarino', 'Circuito Feliz', 'chiptune', 132, 2, 'ionian', true, 'pixel'],
  ['Soneca na Rede', 'Preguiça Tropical', 'reggae', 80, 9, 'ionian', true, 'praia'],
  ['Volume no Máximo', 'Amplificador Azul', 'rock-arena', 126, 4, 'mixolydian', false, 'arena'],
  ['Trovão de Algodão', 'Nuvem Pesada', 'metal', 152, 4, 'aeolian', false, 'vulcao'],
  ['Corre, Cometa, Corre!', 'Os Foguetes de Papelão', 'punk', 176, 9, 'ionian', false, 'garagem'],
  ['Luzinhas da Cidade', 'Neon Kids do Bairro', 'eletronica', 124, 6, 'aeolian', false, 'neon'],
  ['Pipoca no Arraiá', 'Sanfoninha de Ouro', 'forro', 120, 2, 'mixolydian', false, 'festa-junina'],
  ['Passinho do Planeta', 'MC Órbita', 'funk', 130, 9, 'aeolian', false, 'baile'],
  ['Chuva de Purpurina', 'Estrelinhas K', 'kpop', 122, 11, 'dorian', false, 'palco-pop'],
  ['Tarefa de Casa Relax', 'Caderno Lo-fi', 'lofi', 80, 3, 'dorian', false, 'estudio'],
  ['Bota de Estrela', 'Dupla Céu & Cerrado', 'sertanejo', 94, 7, 'ionian', false, 'rodeio'],
  ['Abadá Arco-Íris', 'Bloco Pula-Pula', 'axe', 132, 0, 'mixolydian', false, 'carnaval'],
  ['Abertura do Reino Bloop', 'Orquestra Bolinha', 'orquestral', 104, 2, 'aeolian', false, 'castelo'],
  ['Fita Cassete do Futuro', 'Turbo Retrô', 'synthwave', 108, 9, 'aeolian', false, 'neon'],
  ['Meia de Bolinha', 'Groove de Meia', 'groove', 116, 4, 'dorian', false, 'discoteca'],
  ['Festa do Meu Pet', 'Os Bloopinhos', 'pop', 104, 7, 'ionian', true, 'palco-pop'],
  ['O Grande Show Bloop', 'Bloop All-Stars', 'rock-arena', 132, 9, 'ionian', false, 'arena'],
];

const NEIGHBOR: Record<StyleId, StyleId> = {
  'rock-arena': 'punk', metal: 'rock-arena', punk: 'rock-arena', pop: 'kpop', funk: 'eletronica', samba: 'axe', forro: 'sertanejo',
  sertanejo: 'forro', eletronica: 'synthwave', kpop: 'pop', lofi: 'reggae', reggae: 'lofi', axe: 'samba', chiptune: 'eletronica',
  orquestral: 'metal', synthwave: 'eletronica', groove: 'funk',
};

export interface SeasonMusic {
  season: number;
  theme: string;
  style: StyleId;
  stage: string;
  songs: string[]; // 3 ids normais
  mega: string;
}

export const SEASON_MUSIC_INFO: SeasonMusic[] = [];

function entry(spec: SongSpec, title: string, band: string, tier: CatalogEntry['tier'], stage: string, season?: number): CatalogEntry {
  const secs = planSections(spec);
  const bars = secs.reduce((a, s) => a + s.bars, 0);
  return { spec, title, band, tier, season, stage, bars, durationSec: Math.round(((bars * 4 + 4) * 60) / spec.bpm * 10) / 10 };
}

function buildCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  FREE.forEach(([title, band, style, bpm, key, mode, easy, stage], i) => {
    const id = `free-${NN(i + 1)}`;
    out.push(entry({ id, seed: hash(id), style, bpm, key, mode, easy }, title, band, 'free', stage));
  });
  SEASON_MUSIC.forEach((line, si) => {
    const [theme, style0, stage, titles, bands] = line.split('|');
    const style = style0 as StyleId;
    const tt = titles.split(';');
    const bb = bands.split(';');
    const ids: string[] = [];
    tt.forEach((title, k) => {
      const id = `s${NN(si)}-${k + 1}`;
      ids.push(id);
      const r = rng(hash(id));
      const stl = k === 2 ? NEIGHBOR[style] : style;
      const st = STYLES[stl];
      const bpm = Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
      const mode = st.modes[Math.floor(r() * st.modes.length)];
      const key = Math.floor(r() * 12);
      out.push(entry({ id, seed: hash(id), style: stl, bpm, key, mode }, title, k === 2 ? bb[1] : bb[0], 'pass', k === 2 ? (st.stage === stage ? stage : st.stage) : stage, si));
    });
    const [title, band, mstyle, bpm, key, mode, up, solo, flavor, flags] = MEGA[si].split('|');
    const id = `s${NN(si)}-mega`;
    const tune: MegaTune = {
      keyUp: Number(up),
      soloBars: Number(solo),
      flavor: flavor as MegaTune['flavor'],
      doubleKick: flags.includes('dk'),
      intro: flags.includes('build') ? 'build' : 'riff',
      hook: hash(`${id}:gancho`),
      drive: mstyle === 'metal' ? 0.95 : undefined,
    };
    out.push(entry({ id, seed: hash(id), style: mstyle as StyleId, bpm: Number(bpm), key: Number(key), mode: mode as ModeId, mega: tune }, title, band, 'mega', stage, si));
    SEASON_MUSIC_INFO.push({ season: si, theme, style, stage, songs: ids, mega: id });
  });
  return out;
}

export const CATALOG: CatalogEntry[] = buildCatalog();
