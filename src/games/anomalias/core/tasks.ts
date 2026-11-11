/* ============================================================
 *  ANOMALIAS — TAREFAS do turno (dirigidas pelos InteractDef do mapa).
 *  Handler plugável por `kind` (MapBuild.taskHandlers); padrão do núcleo:
 *    gives  → escolher 1 item para carregar
 *    wants  → entregar o item pedido (balão com o ícone)
 *    holdSec→ segurar o botão
 *    senão  → um toque
 * ============================================================ */
import type { InteractDef, MapBuild, TaskAction, TaskHandler } from '../maps/types';
import { Rng } from './util';

export interface Task {
  def: InteractDef;
  /** item pedido (wants) */
  want: string | null;
  done: boolean;
}

export const DEFAULT_HANDLER: TaskHandler = {
  action(def, st) {
    if (def.gives?.length) return { type: 'choose', options: def.gives };
    if (def.wants?.length) return st.carrying && st.carrying === st.want ? { type: 'tap' } : { type: 'none' };
    if (def.holdSec) return { type: 'hold', sec: def.holdSec };
    return { type: 'tap' };
  },
};

export class TaskBoard {
  readonly tasks: Task[] = [];
  readonly sources: InteractDef[];
  carrying: string | null = null;

  constructor(
    readonly build: MapBuild,
    rng: Rng,
    count: number,
  ) {
    this.sources = build.interacts.filter((d) => d.gives?.length);
    const pool = build.interacts.filter((d) => !d.gives?.length);
    // variedade: no máximo 2 do mesmo tipo, depois completa
    rng.shuffle(pool);
    const byKind = new Map<string, number>();
    const pick: InteractDef[] = [];
    for (const d of pool) {
      if (pick.length >= count) break;
      const n = byKind.get(d.kind) ?? 0;
      if (n >= 2) continue;
      byKind.set(d.kind, n + 1);
      pick.push(d);
    }
    for (const d of pool) if (pick.length < count && !pick.includes(d)) pick.push(d);
    for (const d of pick) {
      const want = d.wants?.length ? rng.pick(d.wants) : null;
      this.tasks.push({ def: d, want, done: false });
      d.setState?.('todo');
      if (want) d.setState?.('want:' + want);
    }
  }

  get doneCount(): number {
    return this.tasks.filter((t) => t.done).length;
  }
  get rooms(): Set<string> {
    return new Set(this.tasks.filter((t) => !t.done).map((t) => t.def.room));
  }
  handler(def: InteractDef): TaskHandler {
    return this.build.taskHandlers?.[def.kind] ?? DEFAULT_HANDLER;
  }
  taskOf(def: InteractDef): Task | undefined {
    return this.tasks.find((t) => t.def === def);
  }
  action(def: InteractDef): TaskAction {
    const t = this.taskOf(def);
    return this.handler(def).action(def, { carrying: this.carrying, want: t?.want ?? null });
  }
  /** interações usáveis: tarefas pendentes + fontes (só se alguma tarefa pede item) */
  usable(): InteractDef[] {
    const list: InteractDef[] = [];
    const needItem = this.tasks.some((t) => !t.done && t.want);
    for (const t of this.tasks) if (!t.done) list.push(t.def);
    if (needItem) list.push(...this.sources);
    return list;
  }
  complete(def: InteractDef, ok: boolean, picked?: string): void {
    this.handler(def).finish?.(def, ok, picked);
    const t = this.taskOf(def);
    if (!t || !ok) return;
    t.done = true;
    if (t.want && this.carrying === t.want) this.carrying = null;
    def.setState?.('done');
  }
}
