/* ============================================================
 *  BLOOP CINEMA — projetos e gravações SÓ no aparelho (IndexedDB).
 *  Nada é enviado para servidor. Stores:
 *   - projects: { id, title, mode, updated, dur, thumb (dataURL), json }
 *   - clips:    { id, pid, blob, dur, env (Float32Array 50 Hz) }
 *  Fallback (IndexedDB indisponível): memória da sessão.
 * ============================================================ */
import { parseProject, projectDuration, type Project } from './format';

export interface ProjectMeta {
  id: string;
  title: string;
  mode: '2d' | '3d';
  updated: number;
  dur: number;
  thumb: string;
}
interface ProjectRow extends ProjectMeta {
  json: string;
}
export interface ClipRow {
  id: string;
  pid: string;
  blob: Blob;
  dur: number;
  env: Float32Array;
}

const DB = 'bloop-cinema';
let dbp: Promise<IDBDatabase | null> | null = null;
const mem = { projects: new Map<string, ProjectRow>(), clips: new Map<string, ClipRow>() };

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips', { keyPath: 'id' }).createIndex('pid', 'pid');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
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

async function store(name: 'projects' | 'clips', mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
  const db = await open();
  if (!db) return null;
  return db.transaction(name, mode).objectStore(name);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  let rows: ProjectRow[];
  const s = await store('projects', 'readonly');
  if (s) rows = await req(s.getAll() as IDBRequest<ProjectRow[]>).catch(() => []);
  else rows = [...mem.projects.values()];
  return rows.map(({ id, title, mode, updated, dur, thumb }) => ({ id, title, mode, updated, dur, thumb })).sort((a, b) => b.updated - a.updated);
}

export async function loadProject(id: string): Promise<Project | null> {
  const s = await store('projects', 'readonly');
  const row = s ? await req(s.get(id) as IDBRequest<ProjectRow | undefined>).catch(() => undefined) : mem.projects.get(id);
  if (!row) return null;
  try {
    return parseProject(JSON.parse(row.json));
  } catch {
    return null;
  }
}

export async function saveProject(p: Project, thumb = ''): Promise<void> {
  p.updated = Date.now();
  const s0 = await store('projects', 'readonly');
  let old: ProjectRow | undefined;
  if (s0) old = await req(s0.get(p.id) as IDBRequest<ProjectRow | undefined>).catch(() => undefined);
  else old = mem.projects.get(p.id);
  const row: ProjectRow = { id: p.id, title: p.title, mode: p.mode, updated: p.updated, dur: projectDuration(p), thumb: thumb || old?.thumb || '', json: JSON.stringify(p) };
  const s = await store('projects', 'readwrite');
  if (s) await req(s.put(row)).catch((e) => console.warn('[cinema] save', e));
  else mem.projects.set(p.id, row);
}

export async function deleteProject(id: string): Promise<void> {
  const s = await store('projects', 'readwrite');
  if (s) await req(s.delete(id)).catch(() => {});
  else mem.projects.delete(id);
  const c = await store('clips', 'readwrite');
  if (c) {
    const keys = await req(c.index('pid').getAllKeys(id)).catch(() => [] as IDBValidKey[]);
    const c2 = await store('clips', 'readwrite');
    for (const k of keys) c2?.delete(k);
  } else for (const [k, v] of mem.clips) if (v.pid === id) mem.clips.delete(k);
}

export async function putClip(c: ClipRow): Promise<void> {
  const s = await store('clips', 'readwrite');
  if (s) await req(s.put(c)).catch((e) => console.warn('[cinema] clip', e));
  else mem.clips.set(c.id, c);
}

export async function getClip(id: string): Promise<ClipRow | null> {
  const s = await store('clips', 'readonly');
  if (!s) return mem.clips.get(id) ?? null;
  return (await req(s.get(id) as IDBRequest<ClipRow | undefined>).catch(() => undefined)) ?? null;
}

/** Copia os clipes de um projeto para outro (duplicar projeto/remix). */
export async function copyClips(map: Record<string, string>, pid: string): Promise<void> {
  for (const id in map) {
    const c = await getClip(id);
    if (c) await putClip({ ...c, id: map[id], pid });
  }
}

/** Apaga gravações que nenhuma fala usa mais. */
export async function pruneClips(p: Project): Promise<void> {
  const used = new Set<string>();
  for (const s of p.scenes) for (const h of s.shots) for (const l of h.lines) if (l.audio) used.add(l.audio);
  const c = await store('clips', 'readonly');
  if (!c) return;
  const keys = (await req(c.index('pid').getAllKeys(p.id)).catch(() => [])) as string[];
  const dead = keys.filter((k) => !used.has(k));
  if (!dead.length) return;
  const w = await store('clips', 'readwrite');
  for (const k of dead) w?.delete(k);
}
