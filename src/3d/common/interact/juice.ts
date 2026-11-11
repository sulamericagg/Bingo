/* ============================================================
 *  SUCO (kit de interação 3D): cada ação tem som + vibração.
 *  Um nome por evento; o jogo chama feedback('sizzle') e pronto.
 *  Partículas ficam com o jogo (cada modo tem o seu Particles).
 * ============================================================ */
import { tap } from '../../../core/haptics';
import { sfx } from '../sfx';

export type FeedbackKind =
  | 'pick' | 'drop' | 'place' | 'snap' | 'combine' | 'nope'
  | 'knobOn' | 'knobOff' | 'press' | 'doorOpen' | 'doorClose' | 'lever'
  | 'ding' | 'print' | 'sizzle' | 'splash' | 'bubble' | 'chop' | 'crash' | 'whoosh' | 'boing' | 'serve' | 'wrong' | 'rescue';

const H: Record<FeedbackKind, [() => void, 'light' | 'medium' | 'heavy' | null]> = {
  pick: [sfx.pick, 'light'],
  drop: [sfx.drop, null],
  place: [sfx.thunk, 'light'],
  snap: [sfx.catch, 'light'],
  combine: [sfx.swish, 'light'],
  nope: [sfx.thud, 'light'],
  knobOn: [() => (sfx.knob(), setTimeout(sfx.ignite, 90)), 'light'],
  knobOff: [sfx.knob, 'light'],
  press: [sfx.press, 'light'],
  doorOpen: [sfx.door, 'light'],
  doorClose: [sfx.thunk, null],
  lever: [sfx.knob, 'light'],
  ding: [sfx.ding, null],
  print: [sfx.print, null],
  sizzle: [sfx.sizzle, null],
  splash: [sfx.splash, 'light'],
  bubble: [sfx.bubble, null],
  chop: [sfx.chop, 'light'],
  crash: [sfx.crash, 'heavy'],
  whoosh: [sfx.whoosh, null],
  boing: [sfx.boing, 'light'],
  serve: [() => (sfx.ding(), setTimeout(sfx.yay, 120)), 'medium'],
  wrong: [sfx.thud, 'medium'],
  rescue: [sfx.poof, null],
};

/** toca o som (e vibra) do evento */
export function feedback(k: FeedbackKind, haptic = true): void {
  const [f, h] = H[k];
  f();
  if (haptic && h) tap(h);
}
