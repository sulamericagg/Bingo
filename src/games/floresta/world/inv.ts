/* ============================================================
 *  MUNDO — inventário (9 na barra + 27 na mochila + 4 de roupa),
 *  baús e fornalhas. Pilhas {id, n, d (desgaste)}.
 * ============================================================ */
import { ITEM, SMELT } from './items';

export interface Stack {
  id: string;
  n: number;
  /** desgaste usado (ferramentas/armaduras) */
  d?: number;
}
export const HOTBAR = 9;
export const BAG = 27;

export const maxStack = (id: string) => ITEM.get(id)?.stack ?? 99;

export class Slots {
  s: (Stack | null)[];
  constructor(n: number) {
    this.s = new Array(n).fill(null);
  }
  /** põe n do item; devolve o que sobrou */
  add(id: string, n: number, d?: number, from = 0, to = this.s.length): number {
    const mx = maxStack(id);
    if (mx > 1)
      for (let i = from; i < to && n > 0; i++) {
        const st = this.s[i];
        if (st && st.id === id && st.n < mx) {
          const k = Math.min(n, mx - st.n);
          st.n += k;
          n -= k;
        }
      }
    for (let i = from; i < to && n > 0; i++) {
      if (this.s[i]) continue;
      const k = Math.min(n, mx);
      this.s[i] = { id, n: k, ...(d ? { d } : {}) };
      n -= k;
    }
    return n;
  }
  count(id: string): number {
    let n = 0;
    for (const st of this.s) if (st && st.id === id) n += st.n;
    return n;
  }
  remove(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.s.length - 1; i >= 0 && n > 0; i--) {
      const st = this.s[i];
      if (!st || st.id !== id) continue;
      const k = Math.min(n, st.n);
      st.n -= k;
      n -= k;
      if (st.n <= 0) this.s[i] = null;
    }
    return true;
  }
  toJSON(): (Stack | null)[] {
    return this.s.map((x) => (x ? { ...x } : null));
  }
  load(a: unknown): void {
    if (!Array.isArray(a)) return;
    for (let i = 0; i < this.s.length && i < a.length; i++) {
      const v = a[i] as Stack | null;
      this.s[i] = v && typeof v.id === 'string' && ITEM.has(v.id) && typeof v.n === 'number' && v.n > 0 ? { id: v.id, n: Math.min(v.n, maxStack(v.id)), ...(v.d ? { d: v.d } : {}) } : null;
    }
  }
}

export class Inventory extends Slots {
  armor = new Slots(4);
  sel = 0;
  constructor() {
    super(HOTBAR + BAG);
  }
  /** prefere a barra, depois a mochila */
  give(id: string, n = 1, d?: number): number {
    if (!ITEM.has(id)) return n;
    // completa pilhas existentes em qualquer lugar, depois casas vazias da barra, depois mochila
    const mx = maxStack(id);
    if (mx > 1)
      for (let i = 0; i < this.s.length && n > 0; i++) {
        const st = this.s[i];
        if (st && st.id === id && st.n < mx) {
          const k = Math.min(n, mx - st.n);
          st.n += k;
          n -= k;
        }
      }
    return this.add(id, n, d);
  }
  held(): Stack | null {
    return this.s[this.sel];
  }
  /** gasta 1 do item na mão */
  useHeld(): void {
    const st = this.s[this.sel];
    if (!st) return;
    st.n--;
    if (st.n <= 0) this.s[this.sel] = null;
  }
  /** desgasta a ferramenta na mão; devolve true se quebrou */
  wear(k = 1): boolean {
    const st = this.s[this.sel];
    if (!st) return false;
    const dur = ITEM.get(st.id)?.dur;
    if (!dur) return false;
    st.d = (st.d ?? 0) + k;
    if (st.d >= dur) {
      this.s[this.sel] = null;
      return true;
    }
    return false;
  }
  /** defesa total da roupa (0..~20) */
  defense(): number {
    let d = 0;
    for (const st of this.armor.s) if (st) d += ITEM.get(st.id)?.armor?.def ?? 0;
    return d;
  }
}

/** fornalha: entrada, combustível, saída; queima no tempo do jogo */
export class Furnace {
  inp: Stack | null = null;
  fuel: Stack | null = null;
  out: Stack | null = null;
  burn = 0;
  burnMax = 0;
  prog = 0;
  step(dt: number): boolean {
    const r = this.inp ? SMELT.get(this.inp.id) : undefined;
    const canOut = r && (!this.out || (this.out.id === r.out && this.out.n < maxStack(r.out)));
    let changed = false;
    if (this.burn <= 0 && r && canOut && this.fuel) {
      const f = ITEM.get(this.fuel.id)?.fuel ?? 0;
      if (f > 0) {
        this.burn = this.burnMax = f;
        this.fuel.n--;
        if (this.fuel.n <= 0) this.fuel = null;
        changed = true;
      }
    }
    if (this.burn > 0) {
      this.burn -= dt;
      if (r && canOut) {
        this.prog += dt;
        if (this.prog >= (r.time ?? 6)) {
          this.prog = 0;
          this.inp!.n--;
          if (this.inp!.n <= 0) this.inp = null;
          if (this.out) this.out.n += r.n;
          else this.out = { id: r.out, n: r.n };
          changed = true;
        }
      } else this.prog = 0;
    } else this.prog = Math.max(0, this.prog - dt);
    return changed;
  }
  get lit(): boolean {
    return this.burn > 0;
  }
  toJSON(): unknown {
    return { i: this.inp, f: this.fuel, o: this.out, b: Math.round(this.burn * 10) / 10, m: this.burnMax, p: Math.round(this.prog * 10) / 10 };
  }
  load(o: any): void {
    if (!o) return;
    const ok = (s: any): Stack | null => (s && ITEM.has(s.id) && s.n > 0 ? { id: s.id, n: s.n } : null);
    this.inp = ok(o.i);
    this.fuel = ok(o.f);
    this.out = ok(o.o);
    this.burn = +o.b || 0;
    this.burnMax = +o.m || 0;
    this.prog = +o.p || 0;
  }
}
