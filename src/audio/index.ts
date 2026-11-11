/* ============================================================
 *  BLOOP AUDIO — API pública para os jogos.
 *
 *    import { sfx, music, ambience, definePack } from '../../audio';
 *
 *    sfx.play('axe')                     som do pacote do jogo aberto (cai no 'base')
 *    sfx.play('noites.owl', { pan: -0.5 })   som de um pacote específico
 *    sfx.at('chop', x, y, z)             som posicional 3D (ouvinte = sfx.listener(...))
 *    sfx.material('break', 'stone')      quebra/cava/passo por material (pacote floresta)
 *    music.play('noites') / music.setState('tension') / music.sting('win')
 *    ambience.start('noites') / ambience.stop()
 *    const m = new Motor({ kind: 'diesel', idle: 34, top: 78 }); m.set(acel, vel); m.stop();
 *
 *  Pacote próprio (ex.: jogo novo):
 *    definePack({ id: 'jangada', name: 'Jangada', theme: 'tema', sounds: { remo: S(receita, 0.4) }, amb: {...} })
 *    — o pacote liga sozinho quando o hub abre o jogo com esse id (glue.ts).
 * ============================================================ */
import { engine } from './engine';
import { play, loop, type PlayOpts, type SoundHandle } from './sound';

export { engine } from './engine';
export { music, renderTheme } from './music';
export { ambience, Motor } from './ambience';
export { definePack, getPack, listPacks, play, loop, prepare, renderSound, soundNames, setActivePack, activePack } from './sound';
export type { Pack, SoundDef, PlayOpts, SoundHandle, MotorPreset, Recipe } from './sound';
export { THEMES, themeIds } from './music/themes';
export type { Theme, Part, MState, StingId } from './music/player';
export { enterGame, enterHub } from './glue';
export * as dsp from './dsp';
export * as lib from './packs/lib';

export type Material = 'dirt' | 'stone' | 'wood' | 'sand' | 'glass' | 'leaves' | 'snow' | 'metal';

export const sfx = {
  play(name: string, o?: PlayOpts): SoundHandle | null {
    return play(name, o);
  },
  /** som posicional (coordenadas do mundo; ouvinte via sfx.listener) */
  at(name: string, x: number, y: number, z: number, o: PlayOpts = {}): SoundHandle | null {
    return play(name, { ...o, pos: [x, y, z] });
  },
  /** ouvinte = câmera (posição e direção) */
  listener(x: number, y: number, z: number, fx = 0, fy = 0, fz = -1): void {
    engine.setListener(x, y, z, fx, fy, fz);
  },
  /** quebrar/cavar/pisar por material (pacote 'floresta' por padrão) */
  material(kind: 'dig' | 'break' | 'step', m: Material | string, o: PlayOpts = {}, pack = 'floresta'): SoundHandle | null {
    return play(`${pack}.${kind}_${m}`, o) ?? null;
  },
  loop(name: string, o?: PlayOpts): Promise<SoundHandle | null> {
    return loop(name, o);
  },
  /** abaixa a música (fala, aviso importante) */
  duck(amount = 0.5, hold = 0.6): void {
    engine.duck(amount, hold);
  },
};
