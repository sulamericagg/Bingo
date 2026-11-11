/* ============================================================
 *  TV BLOOP — filmes oficiais do "Estúdio Bloop".
 *
 *  ~100 filmes curtos (2D e 3D) gerados dos roteiros em tvfilms/
 *  (scripts/tv/gen-films.mjs → shared/tv-films.json). São DADOS de
 *  projeto (não vídeo): o app carrega o JSON sob demanda (chunk
 *  próprio) e desenha com o player do Cinema. O servidor usa o mesmo
 *  JSON para pô-los na grade ao vivo, misturados com os filmes
 *  aprovados das crianças (docs/LOJA-TV.md).
 *  Miniaturas: public/tv/thumbs/<id>.webp (scripts/tv/thumbs.mjs).
 * ============================================================ */
import { t } from '../i18n';
import type { Genre, OfficialMeta } from './tvfilms/dsl';
import { flatShots, type Project } from './format';

export type { Genre, OfficialMeta };
export interface OfficialEntry extends OfficialMeta {
  p: unknown;
}

export const OFFICIAL_AUTHOR = 'Estúdio Bloop';
export const isOfficialId = (id: string): boolean => id.startsWith('bloop-');

let cache: Promise<OfficialEntry[]> | null = null;
/** Catálogo completo (chunk carregado sob demanda). */
export function loadOfficial(): Promise<OfficialEntry[]> {
  if (!cache)
    cache = import('../../shared/tv-films.json?raw')
      .then((m) => (JSON.parse(m.default) as { films: OfficialEntry[] }).films)
      .catch((e) => {
        cache = null;
        throw e;
      });
  return cache;
}

/** Projeto (cópia nova) de um filme oficial — passe por parseProject antes de usar. */
export function officialProject(films: OfficialEntry[], id: string): unknown {
  const f = films.find((x) => x.id === id);
  return f ? JSON.parse(JSON.stringify(f.p)) : null;
}

export const thumbUrl = (id: string): string => `tv/thumbs/${id}.webp`;

/** Um bom instante para a miniatura: plano aberto com 2+ personagens, perto de 40% do filme. */
export function thumbTime(p: Project): number {
  const flat = flatShots(p);
  let total = 0;
  for (const r of flat) total += r.shot.dur;
  let best = total * 0.4;
  let score = -1e9;
  for (const r of flat) {
    const c = r.shot.cam[0];
    const n = r.shot.actors.length;
    const wide = !c?.focus || c.p3 === 'ots';
    const ln = r.shot.lines[0];
    // balão já escrito por inteiro (o texto aparece aos poucos)
    const mid = r.start + (ln ? Math.min(r.shot.dur - 0.1, ln.t + ln.dur * 0.92) : r.shot.dur * 0.6);
    const s = (wide ? 3 : 0) + Math.min(3, n) * 2 - Math.abs(mid / total - 0.4) * 6 + (r.shot.transition.kind === 'cut' ? 0.5 : 0);
    if (s > score) {
      score = s;
      best = mid;
    }
  }
  return best;
}

export const GENRE_UI: Record<Genre, [string, () => string]> = {
  comedia: ['😂', () => t('tv.g.comedia', 'Comédia')],
  aventura: ['🗺️', () => t('tv.g.aventura', 'Aventura')],
  misterio: ['🔎', () => t('tv.g.misterio', 'Mistério')],
  escola: ['🏫', () => t('tv.g.escola', 'Escola')],
  esporte: ['⚽', () => t('tv.g.esporte', 'Esporte')],
  espaco: ['🚀', () => t('tv.g.espaco', 'Espaço')],
  fazenda: ['🐑', () => t('tv.g.fazenda', 'Fazenda')],
  festa: ['🎉', () => t('tv.g.festa', 'Festa')],
  amizade: ['🤝', () => t('tv.g.amizade', 'Amizade')],
  tutorial: ['🎓', () => t('tv.g.tutorial', 'Como fazer')],
};

/**
 * Grade local (sem internet): todos os aparelhos sem rede veem a mesma sequência,
 * embaralhada por dia, com 4 s de vinheta entre os filmes.
 */
export function localSlot(films: OfficialEntry[], now: number, gapMs = 4000): { id: string; title: string; start: number; dur: number; next: { id: string; title: string; start: number; dur: number }[] } | null {
  if (!films.length) return null;
  const day = Math.floor(now / 86_400_000);
  let s = (day * 2654435761) >>> 0;
  const order = films.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 12345) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const durs = order.map((i) => Math.round(films[i].dur * 1000) + gapMs);
  const cycle = durs.reduce((a, b) => a + b, 0);
  const dayStart = day * 86_400_000;
  let at = dayStart + Math.floor((now - dayStart) / cycle) * cycle;
  let k = 0;
  while (at + durs[k] <= now) {
    at += durs[k];
    k = (k + 1) % order.length;
  }
  const slot = (kk: number, st: number) => {
    const f = films[order[kk % order.length]];
    return { id: f.id, title: f.title, start: st + gapMs, dur: Math.round(f.dur * 1000) };
  };
  const cur = slot(k, at);
  const next = [];
  let st = at + durs[k];
  for (let i = 1; i <= 4; i++) {
    next.push(slot(k + i, st));
    st += durs[(k + i) % order.length];
  }
  return { ...cur, next };
}
