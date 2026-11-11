/* CONSERTOS — fábrica dos minijogos (um por tipo de quebra) */
import '../repair.css';
import type { BreakKind } from '../model';
import { Overlay, type MgCtx, type MiniGame } from '../ui/overlay';
import { TyreGame } from './tyre';

export function makeGame(kind: BreakKind, ctx: MgCtx): MiniGame {
  switch (kind) {
    default:
      return new TyreGame(ctx);
  }
}
/** abre o minijogo em tela cheia; cb(ok, estrelas) ao fechar */
export function openGame(parent: HTMLElement, kind: BreakKind, ctx: MgCtx, cb: (ok: boolean, bonus: number) => void): Overlay {
  return new Overlay(makeGame(kind, ctx), { parent, onClose: cb });
}
