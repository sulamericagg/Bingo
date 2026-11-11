/**
 * Recorde pessoal de cada jogo para mostrar no card do hub.
 * Lê direto do save/localStorage (sem importar os módulos dos jogos: abertura rápida).
 */
import { save } from '../core/storage';
import { fmt, t } from '../i18n';

function lsNum(key: string, field?: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    if (!field) return Number(raw) || 0;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return Number(o?.[field]) || 0;
  } catch {
    return 0;
  }
}

/** texto do recorde ('' = ainda não jogou) */
export function bestLabel(id: string): string {
  const s = save as unknown as { best?: number; rally?: { best?: number }; tycoon?: { wins?: number } };
  switch (id) {
    case 'orbit':
      return s.best ? t('best.orbit', 'Recorde: {n} pts', { n: fmt(s.best) }) : '';
    case 'tubo': {
      const b = lsNum('bo-tubo-best');
      return b ? t('best.tubo', 'Recorde: {n} pts', { n: fmt(b) }) : '';
    }
    case 'rally': {
      const b = s.rally?.best ?? 0;
      return b ? t('best.rally', 'Recorde: {n} m', { n: fmt(b) }) : '';
    }
    case 'disaster': {
      const b = lsNum('bo-disaster', 'best');
      return b ? t('best.disaster', 'Melhor sequência: {n}', { n: fmt(b) }) : '';
    }
    case 'tycoon': {
      const w = s.tycoon?.wins ?? 0;
      return w ? t('best.tycoon', 'Vitórias: {n}', { n: fmt(w) }) : '';
    }
    case 'cor': {
      const b = lsNum('bw-cor', 'bestAcc');
      return b ? t('best.cor', 'Melhor precisão: {n}%', { n: b.toFixed(1).replace('.', t('cor.decimal', ',')) }) : '';
    }
    case 'lugar': {
      const b = lsNum('bw-lugar', 'solved');
      return b ? t('best.lugar', 'Fases resolvidas: {n}', { n: fmt(b) }) : '';
    }
    case 'voo': {
      const b = lsNum('bw-voo', 'best');
      return b ? t('best.voo', 'Recorde: {n} pts', { n: fmt(b) }) : '';
    }
    case 'garimpo': {
      // maior quantia de ouro vendida entre os espaços de save
      let b = 0;
      try {
        const m = JSON.parse(localStorage.getItem('bw-garimpo') || '[]') as ({ sold?: number } | null)[];
        for (const x of m) b = Math.max(b, Math.round(x?.sold ?? 0));
      } catch {
        /* */
      }
      return b ? t('best.garimpo', 'Ouro vendido: {n} g', { n: fmt(b) }) : '';
    }
    default:
      return '';
  }
}
