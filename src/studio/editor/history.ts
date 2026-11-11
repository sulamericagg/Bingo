/* ============================================================
 *  BLOOP STUDIO — desfazer/refazer (pilha de comandos).
 *  Cada comando guarda só o que mudou: peças (antes/depois por id) e,
 *  se mudaram, as listas de juntas/fichas/materiais inteiras (são pequenas).
 *  Uso: const tx = hist.begin(doc); ...muda o doc...; hist.end(tx, 'mover')
 * ============================================================ */
import type { Creation, Joint, LogicRule, Material, Part } from '../format';

interface Snap {
  parts: Map<number, string>;
  joints: string;
  logic: string;
  materials: string;
  meta: string;
  extra: string;
}
export interface Command {
  label: string;
  parts: [number, Part | null, Part | null][];
  joints?: [Joint[], Joint[]];
  logic?: [LogicRule[], LogicRule[]];
  materials?: [Material[], Material[]];
  meta?: [Meta, Meta];
  /** v3: terreno, mundo personalizado e missão (JSON inteiro de cada um) */
  extra?: [Extra, Extra];
}
interface Extra {
  terrain?: Creation['terrain'];
  gen?: Creation['gen'];
  mission?: Creation['mission'];
}
const extraOf = (d: Creation): Extra => ({ terrain: d.terrain, gen: d.gen, mission: d.mission });
interface Meta {
  name: string;
  kind: Creation['kind'];
  worldKind?: Creation['worldKind'];
  seed?: number;
}
export interface Tx {
  snap: Snap;
}

const metaOf = (d: Creation): Meta => ({ name: d.name, kind: d.kind, worldKind: d.worldKind, seed: d.seed });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function snapshot(d: Creation): Snap {
  const parts = new Map<number, string>();
  for (const p of d.parts) parts.set(p.id, JSON.stringify(p));
  return { parts, joints: JSON.stringify(d.joints), logic: JSON.stringify(d.logic), materials: JSON.stringify(d.materials), meta: JSON.stringify(metaOf(d)), extra: JSON.stringify(extraOf(d)) };
}

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private max = 120;
  /** chamado com os ids de peças que mudaram (null = tudo) */
  constructor(private onApply: (cmd: Command, ids: number[]) => void) {}

  begin(d: Creation): Tx {
    return { snap: snapshot(d) };
  }

  /** fecha a transação; devolve o comando (ou null se nada mudou) */
  end(d: Creation, tx: Tx, label: string): Command | null {
    const before = tx.snap;
    const cmd: Command = { label, parts: [] };
    const seen = new Set<number>();
    for (const p of d.parts) {
      seen.add(p.id);
      const b = before.parts.get(p.id);
      const a = JSON.stringify(p);
      if (b !== a) cmd.parts.push([p.id, b ? (JSON.parse(b) as Part) : null, JSON.parse(a) as Part]);
    }
    for (const [id, b] of before.parts) if (!seen.has(id)) cmd.parts.push([id, JSON.parse(b) as Part, null]);
    const j = JSON.stringify(d.joints);
    if (j !== before.joints) cmd.joints = [JSON.parse(before.joints), JSON.parse(j)];
    const l = JSON.stringify(d.logic);
    if (l !== before.logic) cmd.logic = [JSON.parse(before.logic), JSON.parse(l)];
    const m = JSON.stringify(d.materials);
    if (m !== before.materials) cmd.materials = [JSON.parse(before.materials), JSON.parse(m)];
    const mt = JSON.stringify(metaOf(d));
    if (mt !== before.meta) cmd.meta = [JSON.parse(before.meta), JSON.parse(mt)];
    const ex = JSON.stringify(extraOf(d));
    if (ex !== before.extra) cmd.extra = [JSON.parse(before.extra), JSON.parse(ex)];
    if (!cmd.parts.length && !cmd.joints && !cmd.logic && !cmd.materials && !cmd.meta && !cmd.extra) return null;
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack.length = 0;
    return cmd;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  undo(d: Creation): string | null {
    const c = this.undoStack.pop();
    if (!c) return null;
    this.apply(d, c, false);
    this.redoStack.push(c);
    return c.label;
  }
  redo(d: Creation): string | null {
    const c = this.redoStack.pop();
    if (!c) return null;
    this.apply(d, c, true);
    this.undoStack.push(c);
    return c.label;
  }

  private apply(d: Creation, c: Command, fwd: boolean): void {
    const ids: number[] = [];
    for (const [id, b, a] of c.parts) {
      const want = fwd ? a : b;
      const i = d.parts.findIndex((p) => p.id === id);
      if (want) {
        if (i >= 0) d.parts[i] = clone(want);
        else d.parts.push(clone(want));
      } else if (i >= 0) d.parts.splice(i, 1);
      ids.push(id);
    }
    if (c.joints) d.joints = clone(c.joints[fwd ? 1 : 0]);
    if (c.logic) d.logic = clone(c.logic[fwd ? 1 : 0]);
    if (c.materials) d.materials = clone(c.materials[fwd ? 1 : 0]);
    if (c.meta) Object.assign(d, clone(c.meta[fwd ? 1 : 0]));
    if (c.extra) {
      const e = clone(c.extra[fwd ? 1 : 0]);
      for (const k of ['terrain', 'gen', 'mission'] as const) {
        if (e[k] === undefined) delete d[k];
        else (d as unknown as Record<string, unknown>)[k] = e[k];
      }
    }
    this.onApply(c, ids);
  }
}
