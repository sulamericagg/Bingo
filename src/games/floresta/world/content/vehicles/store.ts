/* Projetos salvos pelo jogador (localStorage; o motor pode trocar por outro armazenamento). */
import { decodeDesign, encodeDesign, type VehicleDesign } from './design';

const KEY = 'bloop.mveic.designs.v1';
const MAX = 40;

export interface DesignStore {
  list(): VehicleDesign[];
  save(d: VehicleDesign): void;
  remove(id: string): void;
}

export const localDesigns: DesignStore = {
  list() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as string[];
      return raw.map((s) => decodeDesign(s)).filter((d): d is VehicleDesign => !!d);
    } catch {
      return [];
    }
  },
  save(d) {
    const all = this.list().filter((o) => o.id !== d.id);
    all.unshift(d);
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX).map(encodeDesign)));
    } catch {
      /* cheio/bloqueado */
    }
  },
  remove(id) {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list().filter((o) => o.id !== id).map(encodeDesign)));
    } catch {
      /* */
    }
  },
};
