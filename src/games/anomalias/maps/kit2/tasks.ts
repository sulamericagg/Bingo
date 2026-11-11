/* ============================================================
 *  ANOMALIAS (kit2) — handlers de tarefa (contrato v1.1):
 *  "escolher o certo" — o cliente/carro pede um item (o núcleo mostra
 *  as opções com forma+cor) e só o certo conclui. A resposta fica fixa
 *  por tarefa até ela ser concluída; depois sorteia outra.
 * ============================================================ */
import type { InteractDef, TaskHandler } from '../types';

export function chooseHandler(options: string[], icon: string, n = 3, seed = 7): TaskHandler {
  const ans = new Map<string, string>();
  const opts = new Map<string, string[]>();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (d: InteractDef) => {
    let a = ans.get(d.id);
    if (!a) {
      a = options[Math.floor(rnd() * options.length)];
      const rest = options.filter((o) => o !== a).sort(() => rnd() - 0.5);
      const list = [a, ...rest.slice(0, Math.max(0, n - 1))].sort(() => rnd() - 0.5);
      ans.set(d.id, a);
      opts.set(d.id, list);
    }
    return { a, list: opts.get(d.id)! };
  };
  return {
    action(d) {
      const { a, list } = pick(d);
      return { type: 'choose', icon, options: list, answer: a };
    },
    finish(d, ok) {
      if (ok) {
        ans.delete(d.id);
        opts.delete(d.id);
      }
    },
  };
}
