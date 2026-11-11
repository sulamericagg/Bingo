/* ============================================================
 *  ESTÚDIO BLOOP — todos os filmes oficiais da TV Bloop.
 *  Só é importado pelo gerador (scripts/tv/gen-films.mjs); o app e o
 *  servidor leem o resultado pronto em shared/tv-films.json.
 * ============================================================ */
import { buildFilm, type FilmSpec, type OfficialMeta } from './dsl';
import { hashStr } from '../beatpat';
import type { Project } from '../format';
import { COMEDIA } from './films-comedia';
import { AVENTURA } from './films-aventura';
import { MISTERIO } from './films-misterio';
import { ESCOLA } from './films-escola';
import { ESPORTE } from './films-esporte';
import { ESPACO } from './films-espaco';
import { FAZENDA } from './films-fazenda';
import { FESTA } from './films-festa';
import { AMIZADE } from './films-amizade';
import { TUTORIAL } from './films-tutorial';
import { VARIATIONS } from './variations';

export const SPECS: FilmSpec[] = [...TUTORIAL, ...COMEDIA, ...AVENTURA, ...MISTERIO, ...ESCOLA, ...ESPORTE, ...ESPACO, ...FAZENDA, ...FESTA, ...AMIZADE, ...VARIATIONS];

const BGS = new Set(['bedroom', 'classroom', 'park', 'beach', 'kitchen', 'space', 'castle', 'street', 'stage', 'forest', 'underwater', 'snow', 'desert', 'candy', 'haunted', 'rooftop']);
const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3));

export type OfficialFilm = OfficialMeta & { p: Project };

export function buildAll(): { films: OfficialFilm[]; problems: string[] } {
  const problems: string[] = [];
  const films: OfficialFilm[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();
  const texts: { id: string; w: Set<string> }[] = [];
  for (const spec of SPECS) {
    if (ids.has(spec.id)) problems.push(`id repetido: ${spec.id}`);
    ids.add(spec.id);
    if (titles.has(spec.title.toLowerCase())) problems.push(`título repetido: ${spec.title}`);
    titles.add(spec.title.toLowerCase());
    for (const s of spec.scenes) if (!BGS.has(s.bg)) problems.push(`${spec.id}: cenário desconhecido ${s.bg}`);
    try {
      const { project, meta } = buildFilm(spec);
      if (meta.dur < 30 || meta.dur > 92) problems.push(`${spec.id} "${spec.title}": ${meta.dur.toFixed(1)} s (fora de 30–90 s)`);
      films.push({ ...meta, p: project });
      const w = words(spec.scenes.flatMap((s) => s.b.map((x) => x.split(': ').slice(1).join(' '))).join(' '));
      for (const o of texts) {
        let inter = 0;
        for (const x of w) if (o.w.has(x)) inter++;
        const j = inter / Math.max(1, w.size + o.w.size - inter);
        if (j > 0.4) problems.push(`${spec.id} parecido demais com ${o.id} (${Math.round(j * 100)}%)`);
      }
      texts.push({ id: spec.id, w });
    } catch (e) {
      problems.push(String((e as Error).message));
    }
  }
  return { films, problems };
}

/** versão do conjunto (muda quando qualquer filme muda) — o servidor ressincroniza a grade quando muda */
export const versionOf = (films: OfficialFilm[]): string => hashStr(JSON.stringify(films)).toString(36);
