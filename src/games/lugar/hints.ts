/* BLOOP NO LUGAR — dica em português claro para cada passo lógico. */
import { t } from '../../i18n';
import type { Step } from './engine';
import { REGION_COLORS } from './palette';

export type HintKind = Step['tech'] | 'wrongX' | 'wrongBloop' | 'reveal';

/** nome curto da unidade: "linha 3", "coluna 5", "cor Rosa" (todas femininas em pt: a/na/da) */
export function unitName(u: number, n: number): string {
  if (u < n) return t('lugar.u.row', 'linha {n}', { n: u + 1 });
  if (u < 2 * n) return t('lugar.u.col', 'coluna {n}', { n: u - n + 1 });
  return t('lugar.u.reg', 'cor {c}', { c: REGION_COLORS[u - 2 * n].name() });
}
const kindOf = (u: number, n: number): 0 | 1 | 2 => (u < n ? 0 : u < 2 * n ? 1 : 2);

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return xs.slice(0, -1).join(', ') + t('lugar.and', ' e ') + xs[xs.length - 1];
}
/** "linhas 3 e 4" / "colunas 2, 5 e 6" / "cores Rosa e Menta" */
function groupName(us: number[], n: number): string {
  const k = kindOf(us[0], n);
  const parts = us
    .slice()
    .sort((a, b) => a - b)
    .map((u) => (k === 2 ? REGION_COLORS[u - 2 * n].name() : String((u % n) + 1)));
  const lst = list(parts);
  return k === 0 ? t('lugar.u.rows', 'linhas {l}', { l: lst }) : k === 1 ? t('lugar.u.cols', 'colunas {l}', { l: lst }) : t('lugar.u.regs', 'cores {l}', { l: lst });
}

export function hintTitle(kind: HintKind): string {
  switch (kind) {
    case 'basic':
      return t('lugar.h.t.basic', 'Espaço pessoal');
    case 'single':
      return t('lugar.h.t.single', 'Só sobrou um lugar');
    case 'confine':
      return t('lugar.h.t.confine', 'Cor presa numa fila');
    case 'touch':
      return t('lugar.h.t.touch', 'Ia sufocar alguém');
    case 'group2':
    case 'group3':
    case 'group4':
      return t('lugar.h.t.group', 'Time fechado');
    case 'trial':
      return t('lugar.h.t.trial', 'E se…?');
    case 'wrongX':
      return t('lugar.h.t.wrongX', 'Ops, um X a mais');
    case 'wrongBloop':
      return t('lugar.h.t.wrongBloop', 'Bloop fora do lugar');
    default:
      return t('lugar.h.t.reveal', 'Empurrãozinho');
  }
}

export function hintText(s: Step, n: number): string {
  switch (s.tech) {
    case 'basic':
      return t('lugar.h.basic', 'Bloops não se encostam (nem na diagonal), e cada linha, coluna e cor tem um só. Então tudo em volta deste Bloop, e na linha, coluna e cor dele, leva X.');
    case 'single':
      return t('lugar.h.single', 'A {u} só tem uma casa livre. O Bloop dela tem que ficar aqui!', { u: unitName(s.unit!, n) });
    case 'confine': {
      const from = s.from![0];
      const to = s.to![0];
      if (kindOf(from, n) === 2)
        return t('lugar.h.confineReg', 'Todas as casas livres da {a} estão na {b}. Então o Bloop da {b} é dessa cor: o resto da {b} leva X.', { a: unitName(from, n), b: unitName(to, n) });
      return t('lugar.h.confineLine', 'Na {a}, só sobraram casas da {b}. Então o Bloop da {b} vai ficar nessa fila: o resto da {b} leva X.', { a: unitName(from, n), b: unitName(to, n) });
    }
    case 'touch':
      return s.elim.length > 1
        ? t('lugar.h.touchMany', 'Um Bloop em qualquer casa marcada encostaria (ou dividiria fila) com todas as casas livres da {u}, que ficaria sem lugar. Então elas levam X.', { u: unitName(s.unit!, n) })
        : t('lugar.h.touch', 'Se um Bloop ficasse na casa marcada, a {u} ficaria sem nenhum lugar livre. Então ali é X.', { u: unitName(s.unit!, n) });
    case 'group2':
    case 'group3':
    case 'group4':
      return t('lugar.h.group', 'As {a} só têm lugar dentro das {b}. Os {k} Bloops delas vão ocupar essas filas inteirinhas, então o resto das {b} leva X.', {
        a: groupName(s.from!, n),
        b: groupName(s.to!, n),
        k: s.from!.length,
      });
    case 'trial':
      return t('lugar.h.trial', 'Teste de cabeça: se um Bloop ficasse na casa marcada, seguindo as regras, logo a {u} ficaria sem lugar. Então ali é X.', { u: unitName(s.unit!, n) });
  }
}

export const hintWrongX = (): string => t('lugar.h.wrongX', 'Tem um X numa casa onde mora um Bloop. Tire esse X e olhe de novo!');
export const hintWrongBloop = (): string => t('lugar.h.wrongBloop', 'Este Bloop está no lugar errado. Tire ele daqui e tente de novo.');
export const hintReveal = (): string => t('lugar.h.reveal', 'Vamos de empurrãozinho: um Bloop mora nesta casa.');
