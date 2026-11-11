/* ============================================================
 *  BLOOP CINEMA — catálogos (cenários, poses, expressões, efeitos,
 *  transições, estilos de fala, sons, vozes, elenco pronto).
 *  `pro: true` = exclusivo de quem tem Clube Bloop ou Passe premium.
 * ============================================================ */
import { t } from '../i18n';
import type { BubbleStyle, Cam3dPreset, ExprId, FxKind, PoseId, TransitionKind, VoiceFxId } from './format';

export interface Item<I extends string = string> {
  id: I;
  readonly name: string;
  pro?: boolean;
  /** emoji/símbolo curto para os botões da grade */
  glyph: string;
}

const it = <I extends string>(id: I, glyph: string, name: () => string, pro = false): Item<I> => ({
  id,
  glyph,
  pro,
  get name() {
    return name();
  },
});

export const BACKGROUNDS: Item[] = [
  it('bedroom', '🛏️', () => t('cin.bg.bedroom', 'Quarto')),
  it('classroom', '🏫', () => t('cin.bg.classroom', 'Sala de aula')),
  it('park', '🌳', () => t('cin.bg.park', 'Parque')),
  it('beach', '🏖️', () => t('cin.bg.beach', 'Praia')),
  it('kitchen', '🍳', () => t('cin.bg.kitchen', 'Cozinha')),
  it('space', '🚀', () => t('cin.bg.space', 'Espaço')),
  it('castle', '🏰', () => t('cin.bg.castle', 'Castelo')),
  it('street', '🏙️', () => t('cin.bg.street', 'Rua')),
  it('stage', '🎤', () => t('cin.bg.stage', 'Palco')),
  it('forest', '🌲', () => t('cin.bg.forest', 'Floresta')),
  it('underwater', '🐠', () => t('cin.bg.underwater', 'Fundo do mar'), true),
  it('snow', '⛄', () => t('cin.bg.snow', 'Montanha de neve'), true),
  it('desert', '🌵', () => t('cin.bg.desert', 'Deserto'), true),
  it('candy', '🍭', () => t('cin.bg.candy', 'Terra dos Doces'), true),
  it('haunted', '👻', () => t('cin.bg.haunted', 'Casa assombrada'), true),
  it('rooftop', '🌃', () => t('cin.bg.rooftop', 'Telhado da cidade'), true),
];

export const POSES: Item<PoseId>[] = [
  it('stand', '🧍', () => t('cin.pose.stand', 'Em pé')),
  it('walk', '🚶', () => t('cin.pose.walk', 'Andar')),
  it('run', '🏃', () => t('cin.pose.run', 'Correr')),
  it('wave', '👋', () => t('cin.pose.wave', 'Acenar')),
  it('point', '👉', () => t('cin.pose.point', 'Apontar')),
  it('sit', '🪑', () => t('cin.pose.sit', 'Sentar')),
  it('jump', '⤴️', () => t('cin.pose.jump', 'Pular')),
  it('dance', '💃', () => t('cin.pose.dance', 'Dançar')),
  it('lie', '🛌', () => t('cin.pose.lie', 'Deitar')),
  it('hug', '🤗', () => t('cin.pose.hug', 'Abraçar')),
  it('facepalm', '🤦', () => t('cin.pose.facepalm', 'Mão na cara')),
  it('think', '🤔', () => t('cin.pose.think', 'Pensar')),
  it('cheer', '🙌', () => t('cin.pose.cheer', 'Comemorar'), true),
  it('shrug', '🤷', () => t('cin.pose.shrug', 'Sei lá'), true),
  it('bow', '🙇', () => t('cin.pose.bow', 'Reverência'), true),
  it('clap', '👏', () => t('cin.pose.clap', 'Aplaudir'), true),
  it('scared', '😱', () => t('cin.pose.scared', 'Assustado'), true),
  it('spin', '🌀', () => t('cin.pose.spin', 'Girar'), true),
  it('flex', '💪', () => t('cin.pose.flex', 'Músculo'), true),
  it('sneak', '🥷', () => t('cin.pose.sneak', 'Na ponta do pé'), true),
];

export const EXPRESSIONS: Item<ExprId>[] = [
  it('neutral', '😐', () => t('cin.expr.neutral', 'Normal')),
  it('happy', '😊', () => t('cin.expr.happy', 'Feliz')),
  it('sad', '😢', () => t('cin.expr.sad', 'Triste')),
  it('angry', '😠', () => t('cin.expr.angry', 'Bravo')),
  it('surprised', '😮', () => t('cin.expr.surprised', 'Surpreso')),
  it('sleepy', '😴', () => t('cin.expr.sleepy', 'Com sono')),
  it('love', '😍', () => t('cin.expr.love', 'Apaixonado')),
  it('laughing', '😆', () => t('cin.expr.laughing', 'Rindo')),
  it('crying', '😭', () => t('cin.expr.crying', 'Chorando')),
  it('thinking', '🤨', () => t('cin.expr.thinking', 'Pensativo')),
  it('scared', '😨', () => t('cin.expr.scared', 'Com medo')),
  it('smug', '😏', () => t('cin.expr.smug', 'Convencido')),
  it('wink', '😉', () => t('cin.expr.wink', 'Piscadinha')),
  it('dizzy', '😵', () => t('cin.expr.dizzy', 'Tonto')),
  it('shy', '😳', () => t('cin.expr.shy', 'Envergonhado')),
  it('confused', '😕', () => t('cin.expr.confused', 'Confuso')),
];

export const FX: Item<FxKind>[] = [
  it('shake', '📳', () => t('cin.fx.shake', 'Tremer')),
  it('sparkles', '✨', () => t('cin.fx.sparkles', 'Brilhos')),
  it('rain', '🌧️', () => t('cin.fx.rain', 'Chuva')),
  it('hearts', '💕', () => t('cin.fx.hearts', 'Corações')),
  it('sweat', '💧', () => t('cin.fx.sweat', 'Gota de suor')),
  it('zoomlines', '💥', () => t('cin.fx.zoomlines', 'Linhas de impacto')),
  it('confetti', '🎉', () => t('cin.fx.confetti', 'Confete'), true),
  it('snow', '❄️', () => t('cin.fx.snow', 'Neve'), true),
  it('flash', '⚡', () => t('cin.fx.flash', 'Clarão'), true),
  it('poof', '💨', () => t('cin.fx.poof', 'Puf!'), true),
  it('anger', '💢', () => t('cin.fx.anger', 'Raivinha'), true),
  it('notes', '🎵', () => t('cin.fx.notes', 'Notas musicais'), true),
  it('stars', '💫', () => t('cin.fx.stars', 'Estrelinhas tontas'), true),
];
/** efeitos que se prendem a um ator (os outros são da tela toda) */
export const FX_ON_ACTOR: ReadonlySet<FxKind> = new Set(['hearts', 'sweat', 'anger', 'notes', 'stars', 'poof', 'sparkles']);

export const TRANSITIONS: Item<TransitionKind>[] = [
  it('cut', '✂️', () => t('cin.tr.cut', 'Corte')),
  it('fade', '⬛', () => t('cin.tr.fade', 'Escurecer')),
  it('dissolve', '🌫️', () => t('cin.tr.dissolve', 'Dissolver')),
  it('slide', '➡️', () => t('cin.tr.slide', 'Deslizar')),
  it('zoom', '🔍', () => t('cin.tr.zoom', 'Zoom')),
  it('iris', '⭕', () => t('cin.tr.iris', 'Círculo')),
];

export const BUBBLES: Item<BubbleStyle>[] = [
  it('speech', '💬', () => t('cin.bub.speech', 'Fala')),
  it('shout', '🗯️', () => t('cin.bub.shout', 'Grito')),
  it('think', '💭', () => t('cin.bub.think', 'Pensamento')),
  it('whisper', '🤫', () => t('cin.bub.whisper', 'Cochicho')),
  it('subtitle', '🔤', () => t('cin.bub.subtitle', 'Legenda')),
  it('narration', '📜', () => t('cin.bub.narration', 'Narração')),
];

export const CAM3D: Item<Cam3dPreset>[] = [
  it('wide', '🎬', () => t('cin.cam.wide', 'Geral')),
  it('closeup', '🔎', () => t('cin.cam.closeup', 'Close')),
  it('ots', '👥', () => t('cin.cam.ots', 'Por cima do ombro')),
  it('orbit', '🔄', () => t('cin.cam.orbit', 'Girar em volta')),
  it('dolly', '🎥', () => t('cin.cam.dolly', 'Aproximar')),
  it('low', '⬆️', () => t('cin.cam.low', 'De baixo')),
  it('high', '⬇️', () => t('cin.cam.high', 'De cima')),
  it('side', '↔️', () => t('cin.cam.side', 'De lado')),
];

export const VOICES: Item<VoiceFxId>[] = [
  it('normal', '🎙️', () => t('cin.voice.normal', 'Normal')),
  it('chipmunk', '🐿️', () => t('cin.voice.chipmunk', 'Fininha')),
  it('deep', '🐻', () => t('cin.voice.deep', 'Grossa')),
  it('robot', '🤖', () => t('cin.voice.robot', 'Robô')),
  it('echo', '🏔️', () => t('cin.voice.echo', 'Eco')),
  it('giant', '🦖', () => t('cin.voice.giant', 'Gigante')),
];

export const SFX: Item[] = [
  it('boing', '🦘', () => t('cin.sfx.boing', 'Boing')),
  it('pop', '🫧', () => t('cin.sfx.pop', 'Pop')),
  it('whoosh', '💨', () => t('cin.sfx.whoosh', 'Vupt')),
  it('ding', '🔔', () => t('cin.sfx.ding', 'Plim')),
  it('bonk', '🔨', () => t('cin.sfx.bonk', 'Bonk')),
  it('rimshot', '🥁', () => t('cin.sfx.rimshot', 'Tum-dum-tss')),
  it('applause', '👏', () => t('cin.sfx.applause', 'Aplausos')),
  it('magic', '🪄', () => t('cin.sfx.magic', 'Mágica')),
  it('slip', '🍌', () => t('cin.sfx.slip', 'Escorregão')),
  it('crickets', '🦗', () => t('cin.sfx.crickets', 'Grilos (silêncio)')),
  it('knock', '🚪', () => t('cin.sfx.knock', 'Toc-toc')),
  it('phone', '📱', () => t('cin.sfx.phone', 'Telefone')),
  it('drumroll', '🪘', () => t('cin.sfx.drumroll', 'Rufar')),
  it('sad', '🎺', () => t('cin.sfx.sad', 'Trombone triste')),
  it('thunder', '🌩️', () => t('cin.sfx.thunder', 'Trovão')),
  it('steps', '👣', () => t('cin.sfx.steps', 'Passos')),
];

/** Paleta de cores do elenco (cinema: qualquer uma destas, sem precisar comprar paleta). */
export const SWATCHES = ['#ff8fb8', '#ff5c5c', '#ffaa3b', '#ffd93b', '#9be15d', '#3ecf8e', '#3fc8ff', '#4f7dff', '#9b6bff', '#d77bff', '#ffffff', '#c9b8a3', '#8a5a3c', '#5b5b6e', '#2b2440', '#ffe0c2'];

/* elenco pronto: src/cinema/presets.ts (sem DOM/i18n — usado também pelos filmes do Estúdio Bloop) */
export { PRESETS, presetById, type Preset } from './presets';

export const FREE_MAX_SEC = 60;
export const PRO_MAX_SEC = 300;
export const FREE_MAX_PROJECTS = 3;
