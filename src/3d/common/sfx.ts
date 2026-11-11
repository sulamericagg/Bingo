/* Sons sintetizados dos modos 3D (casa, cozinha, Noites, Voo, Cava & Fala, Garimpo, Estúdio…) — sem arquivos.
 * FACHADA: os nomes abaixo tocam o som do PACOTE do jogo aberto (src/audio/packs) — o "chop" do
 * Noites é um machado na madeira, o da Cozinha é a faca na tábua — e caem no pacote 'base' se o
 * jogo não tiver o seu. Usa o AudioContext ÚNICO do app (barramento de efeitos; respeita "Som"). */
import { engine } from '../../audio/engine';
import { play } from '../../audio/sound';

const p = (name: string) => () => {
  engine.unlock();
  play(name);
};

export const sfx = {
  pick: p('pick'),
  drop: p('drop'),
  throw: p('throw'),
  splat: p('splat'),
  thud: p('thud'),
  kick: p('kick'),
  poof: p('poof'),
  squeak: p('squeak'),
  scrub: p('scrub'),
  vacuum: p('vacuum'),
  clean: p('clean'),
  fix: p('fix'),
  eat: p('eat'),
  paint: p('paint'),
  sparkle: p('sparkle'),
  click: p('click'),
  step: p('step'),
  pop: p('pop'),
  /* cozinha */
  chop: p('chop'),
  sizzle: p('sizzle'),
  bubble: p('bubble'),
  spray: p('spray'),
  crash: p('crash'),
  whoosh: p('whoosh'),
  boing: p('boing'),
  catch: p('catch'),
  swish: p('swish'),
  fire: p('fire'),
  bump: p('bump'),
  /* kit de interação (src/3d/common/interact) */
  ding: p('ding'),
  knob: p('knob'),
  ignite: p('ignite'),
  door: p('door'),
  thunk: p('thunk'),
  print: p('print'),
  splash: p('splash'),
  water: p('water'),
  press: p('press'),
  yay: p('yay'),
};
/** antes fechava um AudioContext próprio; agora o contexto é o único do app (não fecha). */
export function disposeSfx(): void {
  /* nada a liberar */
}
