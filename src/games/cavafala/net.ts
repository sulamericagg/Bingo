/* ============================================================
 *  CAVA & FALA — gancho para multijogador ONLINE (opcional).
 *  Hoje o jogo é 100% offline: a Arena usa bots e a Vila tem ajudantes.
 *  Para ligar online, implemente CavaNet (ex.: com services/online) e
 *  devolva-o em createNet(). O jogo já emite/consome estes eventos:
 *   - 'dig'    {x,y,z,r}          → aplicar no terreno dos outros
 *   - 'build'  {id,mods,x,y,z,yaw} → montar a engenhoca igual
 *   - 'state'  {x,y,z,yaw,pct}     → posição/porcentagem de cada Bloop (10 Hz)
 *   - 'hit'    {target,dx,dy,dz,power}
 *  O terreno é determinístico pela semente: só as edições precisam trafegar.
 * ============================================================ */
export type NetEvent =
  | { t: 'dig'; x: number; y: number; z: number; r: number }
  | { t: 'build'; id: string; mods: unknown; x: number; y: number; z: number; yaw: number }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pct: number }
  | { t: 'hit'; target: string; dx: number; dy: number; dz: number; power: number };

export interface CavaNet {
  readonly peers: string[];
  send(e: NetEvent): void;
  onEvent(f: (from: string, e: NetEvent) => void): void;
  close(): void;
}

/** null = offline (padrão). */
export function createNet(): CavaNet | null {
  return null;
}
