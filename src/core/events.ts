type Fn = (...args: any[]) => void;
const map = new Map<string, Set<Fn>>();

export const bus = {
  on(ev: string, fn: Fn) {
    if (!map.has(ev)) map.set(ev, new Set());
    map.get(ev)!.add(fn);
    return () => map.get(ev)!.delete(fn);
  },
  emit(ev: string, ...args: unknown[]) {
    map.get(ev)?.forEach((fn) => fn(...args));
  },
};
