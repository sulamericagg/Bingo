/**
 * Kit de interação "trabalhe com as mãos" para os modos 3D em 1ª pessoa.
 * Veja docs/INTERACAO-3D.md (princípios, API e como adotar).
 */
export { AimPicker, type AimTarget } from './aim';
export { ControlKit, Control, Knob, PushButton, Lever, HingedDoor, Lid, Spring, type ControlOpts } from './controls';
export { HoverHighlight, SnapGlows, Beacon, WorldTag } from './highlight';
export { CanvasPanel, TicketPrinter, wallScreen, sticker, disposeStickers } from './panel';
export { HandButtons, resolveVerb, type VerbDef, type VerbRule } from './handbtn';
export { Hesitation, Rescuer, solveThrow, magnet, Squash, type RescueState, type RescueOpts } from './assist';
export { feedback, type FeedbackKind } from './juice';
export { IX_ICON } from './icons';
