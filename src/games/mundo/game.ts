/* ============================================================
 *  MUNDO BLOOP — o mundo aberto de blocos (sobrevivência/criação)
 *  como jogo próprio no hub. O motor continua em
 *  src/games/floresta/world/ (compartilhado com o modo clássico);
 *  aqui só a entrada: escolha de mundo → mundo, grupo online, qualidade.
 * ============================================================ */
import '../floresta/floresta.css';
import { QualityGovernor, loadMode } from '../../core/quality';
import type { MiniGameHandle } from '../../hub/registry';
import { consumePartySeat, partySeat } from '../../party/contract';
import { removeFlIconDefs } from '../floresta/icons';
import { MUNDO_ID } from './id';

type WG = import('../floresta/world/worldgame').WorldGame;

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new MundoGame(root, exit);
  await g.start();
  return g;
}

export class MundoGame implements MiniGameHandle {
  world: WG | null = null;
  private wrap: HTMLDivElement;
  private gov: QualityGovernor;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'fl-root mb-root';
    root.appendChild(this.wrap);
    this.gov = new QualityGovernor({
      mode: loadMode(),
      persist: false,
      emit: false,
      onChange: (tier, s) => this.world?.setTier(tier, s),
      onResScale: (k) => this.world?.setResScale(k),
    });
    if (location.search.includes('debug')) (window as unknown as { __mundo: MundoGame }).__mundo = this;
  }

  async start(): Promise<void> {
    const seat = partySeat(MUNDO_ID);
    if (seat) consumePartySeat(MUNDO_ID);
    if (!webglOk()) {
      this.noGl();
      return;
    }
    const m = await import('../floresta/world/worldgame');
    const W = await import('../floresta/world/worlds');
    if (this.destroyed) return;
    const opts = { tier: this.gov.tier, exit: () => this.finish() };
    if (seat) {
      this.world = await m.openServers(this.wrap, opts, { code: seat.code(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'), host: seat.host }, { gameId: MUNDO_ID });
      if (!this.world) return this.finish();
      this.world.onSample = (a, b) => this.gov.sample(a, b);
      return;
    }
    const pick = await W.pickWorld(this.wrap, { servers: m.serversAvailable() });
    if (this.destroyed) return;
    if (!pick) return this.finish();
    if (pick.kind === 'servers') {
      this.world = await m.openServers(this.wrap, opts, undefined, { gameId: MUNDO_ID });
      if (!this.world) return this.finish();
    } else if (pick.kind === 'world') {
      const id = pick.meta.id;
      this.world = m.createWorld(this.wrap, { ...opts, mode: pick.meta.mode, save: pick.save, onSave: (sv) => W.saveWorldById(id, sv) });
    } else this.world = m.createWorld(this.wrap, opts);
    this.world.onSample = (a, b) => this.gov.sample(a, b);
  }

  private noGl(): void {
    const d = document.createElement('div');
    d.className = 'fl-modal';
    d.innerHTML = `<div class="fl-card" style="padding:18px;text-align:center"><b>3D</b><p>WebGL ✕</p><button class="fl-btn red">OK</button></div>`;
    d.querySelector('button')!.addEventListener('click', () => this.finish());
    this.wrap.appendChild(d);
  }

  pause(): void {
    this.world?.pause();
  }
  resume(): void {
    this.world?.resume();
  }
  inMatch(): boolean {
    return !!this.world;
  }
  finish(): void {
    this.destroy();
    this.exitCb();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.world?.destroy();
    this.world = null;
    this.wrap.remove();
    removeFlIconDefs();
  }
}
