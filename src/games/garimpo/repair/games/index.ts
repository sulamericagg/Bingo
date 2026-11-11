/* CONSERTOS — fábrica dos minijogos (um por tipo de quebra) */
import '../repair.css';
import type { BreakKind } from '../model';
import { Overlay, type MgCtx, type MiniGame } from '../ui/overlay';
import { TyreGame } from './tyre';
import { WiresGame } from './wires';
import { PartGame } from './part';
import { BushingGame } from './bushing';
import { BrakeGame } from './brakefix';

export function makeGame(kind: BreakKind, ctx: MgCtx): MiniGame {
  switch (kind) {
    case 'electric':
      return new WiresGame(ctx);
    case 'part':
      return new PartGame(ctx);
    case 'bushing':
      return new BushingGame(ctx);
    case 'brake':
      return new BrakeGame(ctx);
    default:
      return new TyreGame(ctx);
  }
}
/** abre o minijogo em tela cheia; cb(ok, estrelas) ao fechar */
export function openGame(parent: HTMLElement, kind: BreakKind, ctx: MgCtx, cb: (ok: boolean, bonus: number) => void): Overlay {
  return new Overlay(makeGame(kind, ctx), { parent, onClose: cb });
}
