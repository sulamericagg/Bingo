/* ============================================================
 *  ECONOMIA DE BATERIA — 30 fps em TODO o app, sem mexer nos jogos.
 *  Envolve window.requestAnimationFrame: com a economia ligada, os callbacks
 *  pendentes só rodam a cada ~33 ms (alinhados ao vsync); os jogos recebem o
 *  timestamp real, então o dt continua certo. settingsFor() devolve fpsCap 30
 *  nesse modo, e os QualityGovernor dobram os limites (não descem de nível à toa).
 * ============================================================ */
import { bus } from './events';
import { batterySaver } from './quality';

const FRAME_MS = 1000 / 30;
/** tolerância de jitter do vsync */
const SLACK = 2.5;
/** ids próprios bem acima dos nativos (que começam em 1) */
const ID_BASE = 1 << 30;

let installed = false;
let on = false;

/** Instala o limitador (uma vez, no boot) e segue a chave de bus 'battery'. */
export function installFrameCap(): void {
  if (installed || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  installed = true;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCaf = window.cancelAnimationFrame.bind(window);
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = ID_BASE;
  let ticking = false;
  let last = -1;

  const run = (now: number) => {
    const cbs = Array.from(queue.values());
    queue.clear();
    for (const cb of cbs) {
      try {
        cb(now);
      } catch (e) {
        // não derruba os outros callbacks do quadro; o erro segue para o window.onerror
        setTimeout(() => {
          throw e;
        });
      }
    }
  };
  const tick = (now: number) => {
    ticking = false;
    if (!queue.size) return;
    if (on && last >= 0 && now - last < FRAME_MS - SLACK) {
      ticking = true;
      nativeRaf(tick);
      return;
    }
    // não acumula atraso: um quadro perdido não vira rajada
    last = last < 0 || now - last > FRAME_MS * 2 ? now : last + FRAME_MS;
    run(now);
  };

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    if (!on && !queue.size) return nativeRaf(cb);
    const id = nextId++;
    queue.set(id, cb);
    if (!ticking) {
      ticking = true;
      nativeRaf(tick);
    }
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    if (id >= ID_BASE) queue.delete(id);
    else nativeCaf(id);
  };

  const set = (v: boolean) => {
    on = v;
    last = -1;
  };
  set(batterySaver());
  bus.on('battery', (v: boolean) => set(!!v));
}

/** true quando o limite de 30 fps do app está ativo */
export function frameCapOn(): boolean {
  return on;
}
