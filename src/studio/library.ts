/* ============================================================
 *  BLOOP STUDIO — "Minhas criações": salvas no aparelho (IndexedDB).
 *  Sem IndexedDB (navegador antigo / modo privado) cai para localStorage.
 *  Também guarda o cache de criações baixadas da loja (para os mapas que
 *  usam criações de outras pessoas abrirem offline).
 * ============================================================ */
import { validate, type Creation, type CreationKind } from './format';

export interface LibEntry {
  id: string;
  kind: CreationKind;
  name: string;
  updated: number;
  thumb?: string;
  parts: number;
  /** publicado na loja (id da listagem) */
  published?: string;
}

const DB = 'bloop-studio';
const VER = 1;
const MINE = 'mine';
const CACHE = 'cache';
const LS = 'bs-lib:';

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const rq = indexedDB.open(DB, VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains(MINE)) d.createObjectStore(MINE, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(CACHE)) d.createObjectStore(CACHE, { keyPath: 'id' });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

interface Row {
  id: string;
  meta: LibEntry;
  data: Creation;
}

async function put(store: string, row: Row): Promise<void> {
  const d = await db();
  if (d) {
    await req(d.transaction(store, 'readwrite').objectStore(store).put(row));
    return;
  }
  try {
    localStorage.setItem(LS + store + ':' + row.id, JSON.stringify(row));
  } catch {
    throw new Error('quota');
  }
}
async function get(store: string, id: string): Promise<Row | undefined> {
  const d = await db();
  if (d) return (await req(d.transaction(store).objectStore(store).get(id))) as Row | undefined;
  try {
    const s = localStorage.getItem(LS + store + ':' + id);
    return s ? (JSON.parse(s) as Row) : undefined;
  } catch {
    return undefined;
  }
}
async function all(store: string): Promise<Row[]> {
  const d = await db();
  if (d) return (await req(d.transaction(store).objectStore(store).getAll())) as Row[];
  const out: Row[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(LS + store + ':')) out.push(JSON.parse(localStorage.getItem(k)!) as Row);
    }
  } catch {
    /* */
  }
  return out;
}
async function del(store: string, id: string): Promise<void> {
  const d = await db();
  if (d) {
    await req(d.transaction(store, 'readwrite').objectStore(store).delete(id));
    return;
  }
  try {
    localStorage.removeItem(LS + store + ':' + id);
  } catch {
    /* */
  }
}

function metaOf(c: Creation, prev?: LibEntry): LibEntry {
  return { id: c.id, kind: c.kind, name: c.name, updated: c.updated ?? Date.now(), thumb: c.thumbnail, parts: c.parts.length, published: prev?.published };
}

/* --------------------------------- API --------------------------------- */

export async function listMine(): Promise<LibEntry[]> {
  const rows = await all(MINE);
  return rows.map((r) => r.meta).sort((a, b) => b.updated - a.updated);
}

export async function loadMine(id: string): Promise<Creation | null> {
  const r = await get(MINE, id);
  if (!r) return null;
  return validate(r.data).creation;
}

export async function saveMine(c: Creation): Promise<void> {
  const prev = await get(MINE, c.id);
  c.updated = Date.now();
  await put(MINE, { id: c.id, meta: metaOf(c, prev?.meta), data: c });
  memo.set(c.id, c);
}

export async function markPublished(id: string, listingId: string): Promise<void> {
  const r = await get(MINE, id);
  if (!r) return;
  r.meta.published = listingId;
  await put(MINE, r);
}

export async function deleteMine(id: string): Promise<void> {
  await del(MINE, id);
  memo.delete(id);
}

export async function countMaps(): Promise<number> {
  return (await listMine()).filter((e) => e.kind === 'map').length;
}

/** guarda uma criação baixada (loja) para uso offline */
export async function cachePut(c: Creation): Promise<void> {
  memo.set(c.id, c);
  try {
    await put(CACHE, { id: c.id, meta: metaOf(c), data: c });
  } catch {
    /* cache é opcional */
  }
}

/* ---------------------- resolvedor síncrono (memória) ---------------------- */

const memo = new Map<string, Creation>();
/** Resolve referências já carregadas na memória (use preload() antes de montar a cena). */
export function resolveSync(id: string): Creation | undefined {
  return memo.get(id);
}
export function remember(c: Creation): void {
  memo.set(c.id, c);
}
/** Carrega para a memória as criações citadas (minhas → cache → fetcher externo). */
export async function preload(ids: string[], fetcher?: (id: string) => Promise<Creation | null>): Promise<void> {
  for (const id of ids) {
    if (memo.has(id)) continue;
    const r = (await get(MINE, id)) ?? (await get(CACHE, id));
    let c = r ? validate(r.data).creation : null;
    if (!c && fetcher) c = await fetcher(id);
    if (c) memo.set(id, c);
  }
}
