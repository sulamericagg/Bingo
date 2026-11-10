/* ============================================================
 *  LENHADORES — primeira sessão guiada (um objetivo por vez):
 *  cortar → pegar toras → levar ao funil (vira tábua) → vender → comprar ferramenta.
 *  Também diz ONDE apontar a seta 3D/2D e QUAL botão destacar.
 * ============================================================ */
import { t } from '../../i18n';
import { INTAKE_X } from './data';
import { SELL_X, TS, type Sim } from './sim';

export interface GuideStep {
  step: string;
  goal: string;
  tip: string;
  button: '' | 'chop' | 'grab' | 'throw' | 'ctx' | 'shop';
  /** alvo da seta (x, z) */
  tx: number | null;
  tz: number;
}

export function guideStep(s: Sim, is3d: boolean): GuideStep {
  const lvl = s.s.tutorial;
  const me = s.me;
  const carry = is3d ? s.held3d : me.carry;
  const none: GuideStep = { step: 'done', goal: '', tip: '', button: '', tx: null, tz: 0 };
  if (lvl >= 4) return none;
  const nearestTree = () => {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < s.trees.length; i++) {
      const tr = s.trees[i];
      if (tr.state !== TS.Grown || tr.biome >= s.s.unlocked) continue;
      const d = Math.abs(tr.x - me.x) + Math.abs(tr.z - me.z) * 0.5;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best >= 0 ? s.trees[best] : null;
  };
  const nearestLog = () => {
    let best = null as null | { x: number; z: number };
    let bd = 1e9;
    for (const l of s.logs) {
      if (!l.on || l.ghost) continue;
      const d = Math.abs(l.x - me.x) + Math.abs(l.z - me.z);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  };
  if (lvl === 0) {
    const tr = nearestTree();
    return { step: 'chop', goal: t('floresta.goal0', 'Cortar uma árvore'), tip: t('floresta.tut0', 'Vá até uma árvore e segure Cortar!'), button: 'chop', tx: tr ? tr.x : null, tz: tr ? tr.z : 0 };
  }
  if (lvl === 1) {
    if (carry > 0)
      return { step: 'funnel', goal: t('floresta.goal1', 'Levar toras à serraria'), tip: is3d ? t('floresta.tut1fps', 'Pegue as toras e jogue no funil amarelo da serraria') : t('floresta.tut1', 'Leve as toras até o funil amarelo da serraria'), button: is3d ? 'throw' : '', tx: INTAKE_X, tz: 0 };
    const l = nearestLog();
    if (l) return { step: 'pick', goal: t('floresta.goalPick', 'Pegar as toras'), tip: is3d ? t('floresta.tutPick3d', 'Mire numa tora e toque Pegar') : t('floresta.tutPick', 'Passe por cima das toras para pegá-las'), button: is3d ? 'grab' : '', tx: l.x, tz: l.z };
    const tr = nearestTree();
    return { step: 'chop2', goal: t('floresta.goal0', 'Cortar uma árvore'), tip: '', button: 'chop', tx: tr ? tr.x : null, tz: tr ? tr.z : 0 };
  }
  if (lvl === 2) return { step: 'sell', goal: t('floresta.goal2', 'Vender tábuas'), tip: t('floresta.tut2', 'Venda as tábuas na barraca e compre ferramentas na loja'), button: 'ctx', tx: SELL_X, tz: 0 };
  return { step: 'buy', goal: t('floresta.goal3', 'Comprar um machado melhor'), tip: t('floresta.tut3', 'Abra a loja (botão dourado) e compre uma ferramenta'), button: 'shop', tx: null, tz: 0 };
}
