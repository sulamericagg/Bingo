/* ============================================================
 *  BLOOP STUDIO — FORMATO DE CRIAÇÕES (contrato compartilhado)
 *
 *  Este arquivo é o CONTRATO entre o Bloop Studio, o estúdio de machinima
 *  (src/cinema) e o futuro servidor da loja. Mantenha-o ESTÁVEL:
 *   - sem dependências (nem three, nem DOM obrigatório) — roda no Worker/servidor;
 *   - mudanças só ADITIVAS (campos opcionais novos); mudança incompatível = FORMAT_VERSION + migrate();
 *   - documentação completa em docs/STUDIO-FORMATO.md.
 *
 *  Unidades: metros e graus. Eixos: +Y para cima; a "frente" de veículos é −Z
 *  do assento (part.role 'seat'). Rotação: Euler XYZ em graus.
 * ============================================================ */

export const FORMAT_VERSION = 1;

export type Vec3 = [number, number, number];
export type CreationKind = 'object' | 'vehicle' | 'map';
export type WorldKind = 'infinite' | 'flat' | 'void';

/** Primitivas (todas cabem num cubo 1×1×1 centrado na origem antes da escala `s`). */
export const PRIMS = ['box', 'sphere', 'cylinder', 'cone', 'wedge', 'torus', 'capsule', 'ramp', 'arch', 'pipe'] as const;
export type PrimType = (typeof PRIMS)[number];

/** Acabamentos do material. */
export const FINISHES = ['plastic', 'metal', 'glass', 'wood', 'neon', 'rubber'] as const;
export type Finish = (typeof FINISHES)[number];

/** Papel especial de uma peça na hora de JOGAR. */
export const ROLES = ['seat', 'wheel', 'thruster', 'spawn', 'checkpoint', 'goal', 'button', 'zone', 'light', 'hazard'] as const;
export type PartRole = (typeof ROLES)[number];

/** Física por peça: 'static' (padrão, parada e sólida), 'dynamic' (cai/empurra), 'none' (só visual, atravessável). */
export type PhysMode = 'static' | 'dynamic' | 'none';

export interface Material {
  /** cor '#rrggbb' */
  c: string;
  /** acabamento */
  k: Finish;
}

interface PartBase {
  /** id inteiro, único dentro da criação (>= 1) */
  id: number;
  /** posição (m) */
  p: Vec3;
  /** rotação Euler XYZ (graus). Padrão [0,0,0] */
  r?: Vec3;
  /** escala = tamanho em metros para primitivas; multiplicador para traços e criações importadas. Padrão [1,1,1] */
  s?: Vec3;
  /** índice em Creation.materials. Padrão 0 */
  m?: number;
  /** grupo (peças com o mesmo g se movem/selecionam juntas e viram um só corpo físico) */
  g?: number;
  /** camada (0..7) — só organização no editor */
  layer?: number;
  phys?: PhysMode;
  role?: PartRole;
  /** nome curto opcional (lista de camadas) */
  name?: string;
  /** escondida na hora de jogar (ex.: molde para a ficha "criar") */
  hide?: boolean;
}

export interface PrimPart extends PartBase {
  t: PrimType;
}

/** Traço da "Caneta 3D": tubo que passa pelos pontos (coordenadas locais). */
export interface StrokePart extends PartBase {
  t: 'stroke';
  /** pontos achatados [x,y,z, x,y,z, ...] relativos a `p` (2..MAX_STROKE_POINTS pontos) */
  pts: number[];
  /** raio do tubo (m) */
  w: number;
}

/** Outra criação importada (da biblioteca ou da loja), referenciada pelo id. */
export interface RefPart extends PartBase {
  t: 'ref';
  /** id da criação importada */
  ref: string;
  /** hash da versão usada (opcional; para detectar atualização) */
  h?: string;
}

export type Part = PrimPart | StrokePart | RefPart;

export type JointKind = 'hinge' | 'slider' | 'fixed';
export interface Motor {
  /** velocidade: rad/s (dobradiça) ou m/s (trilho) */
  speed: number;
  /** força/torque máximo */
  force?: number;
  /** começa ligado na hora de jogar (padrão true). Fichas podem ligar/desligar. */
  on?: boolean;
}
export interface Joint {
  id: number;
  k: JointKind;
  /** peça A */
  a: number;
  /** peça B (0 = preso ao mundo) */
  b: number;
  /** pivô no espaço da criação */
  at: Vec3;
  /** eixo (dobradiça: eixo de giro; trilho: direção do deslize) */
  axis?: Vec3;
  /** limites: graus (dobradiça) ou metros (trilho) */
  lim?: [number, number];
  motor?: Motor;
}

/* ---------------------------- lógica ("fichas") ---------------------------- */

export type TriggerKind = 'button' | 'zone' | 'timer' | 'start';
export interface Trigger {
  k: TriggerKind;
  /** peça do botão / zona */
  part?: number;
  /** segundos (timer) */
  sec?: number;
}
export type ActionKind = 'door' | 'move' | 'light' | 'teleport' | 'spawn' | 'sound' | 'score' | 'motor' | 'win';
export const SOUNDS = ['ding', 'pop', 'boing', 'whoosh', 'fanfare', 'boom'] as const;
export type SoundId = (typeof SOUNDS)[number];
export interface Action {
  k: ActionKind;
  /** peça alvo (door/move/light/teleport/spawn) */
  part?: number;
  /** junta alvo (motor) */
  joint?: number;
  /** deslocamento (move) */
  d?: Vec3;
  /** pontos (score) */
  n?: number;
  /** som */
  snd?: SoundId;
}
export interface LogicRule {
  id: number;
  on: Trigger;
  do: Action[];
}

export interface Creation {
  /** versão do formato */
  v: number;
  /** id estável (ex.: 'c_k3x9…'); a loja usa o mesmo id */
  id: string;
  kind: CreationKind;
  name: string;
  /** nome exibido do autor (apelido) */
  author: string;
  /** id do autor (handle ou id local) — usado por "Ocultar autor" */
  authorId?: string;
  parts: Part[];
  joints: Joint[];
  logic: LogicRule[];
  materials: Material[];
  /** miniatura (data URL image/webp ou image/jpeg, ≤ MAX_THUMB_BYTES) */
  thumbnail?: string;
  /** mundo (mapas; objetos/veículos usam como sugestão para "Jogar") */
  worldKind?: WorldKind;
  /** semente do mundo infinito */
  seed?: number;
  /** criação de onde esta foi copiada (remix) */
  from?: string;
  /** criações importadas embutidas (para o mapa abrir sem rede). Só 1 nível: deps não têm deps. */
  deps?: Creation[];
  /** ms desde 1970 */
  created?: number;
  updated?: number;
}

/* ------------------------------- limites ------------------------------- */

export const LIMITS = {
  /** teto absoluto do formato (o editor aplica limites menores por qualidade/assinatura) */
  parts: 2000,
  joints: 64,
  logic: 64,
  actionsPerRule: 6,
  materials: 32,
  strokePoints: 256,
  deps: 24,
  nameLen: 32,
  /** distância máxima da origem (m) */
  extent: 2000,
  /** tamanho máximo de uma peça (m) */
  maxSize: 200,
  minSize: 0.02,
  /** bytes do JSON (sem compressão) */
  bytes: 512 * 1024,
  thumbBytes: 40 * 1024,
  refDepth: 3,
} as const;

/* -------------------------------- criação -------------------------------- */

export const DEFAULT_MATERIALS: Material[] = [
  { c: '#ff5cc8', k: 'plastic' },
  { c: '#5ec8ff', k: 'plastic' },
  { c: '#ffd34a', k: 'plastic' },
  { c: '#4fd67a', k: 'plastic' },
  { c: '#f4efff', k: 'plastic' },
  { c: '#3a2a5a', k: 'rubber' },
  { c: '#c8ccd8', k: 'metal' },
  { c: '#a8742e', k: 'wood' },
  { c: '#9fe8ff', k: 'glass' },
  { c: '#7aff6a', k: 'neon' },
];

export function newId(prefix = 'c'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function emptyCreation(kind: CreationKind, name: string, author = '', authorId?: string): Creation {
  const now = Date.now();
  return {
    v: FORMAT_VERSION,
    id: newId(),
    kind,
    name,
    author,
    authorId,
    parts: [],
    joints: [],
    logic: [],
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
    worldKind: kind === 'map' ? 'flat' : undefined,
    created: now,
    updated: now,
  };
}

/** Maior id de peça + 1. */
export function nextPartId(c: Creation): number {
  let m = 0;
  for (const p of c.parts) if (p.id > m) m = p.id;
  return m + 1;
}

/* ------------------------------ validação ------------------------------ */

export interface ValidateResult {
  ok: boolean;
  /** problemas encontrados (peças inválidas são removidas; números são limitados) */
  errors: string[];
  /** cópia saneada (null se irrecuperável) */
  creation: Creation | null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const HEX = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function vec(x: unknown, lim: number, def: Vec3 | null): Vec3 | null {
  if (!Array.isArray(x) || x.length !== 3 || !x.every(isNum)) return def;
  return [clamp(x[0], -lim, lim), clamp(x[1], -lim, lim), clamp(x[2], -lim, lim)];
}

function str(x: unknown, max: number): string {
  return typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

/**
 * Confere e saneia uma criação vinda de qualquer lugar (arquivo, loja, rede).
 * Nunca lança. `ok` = false se havia algo errado (mesmo que a cópia saneada seja usável).
 */
export function validate(input: unknown, depth = 0): ValidateResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['not-object'], creation: null };
  const o = input as Record<string, unknown>;
  const v = isNum(o.v) ? o.v : 0;
  if (v < 1 || v > FORMAT_VERSION) errors.push('version');
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : '';
  if (!id) return { ok: false, errors: ['id'], creation: null };
  const kind: CreationKind = o.kind === 'vehicle' || o.kind === 'map' ? o.kind : 'object';
  if (o.kind !== kind) errors.push('kind');

  const materials: Material[] = [];
  if (Array.isArray(o.materials))
    for (const m of o.materials.slice(0, LIMITS.materials)) {
      const mm = m as Partial<Material>;
      const c = typeof mm?.c === 'string' && HEX.test(mm.c) ? mm.c.toLowerCase() : null;
      const k = (FINISHES as readonly string[]).includes(mm?.k as string) ? (mm.k as Finish) : 'plastic';
      if (!c) errors.push('material');
      materials.push({ c: c ?? '#cccccc', k });
    }
  if (!materials.length) materials.push(...DEFAULT_MATERIALS.map((m) => ({ ...m })));

  const parts: Part[] = [];
  const ids = new Set<number>();
  const rawParts = Array.isArray(o.parts) ? o.parts : [];
  if (rawParts.length > LIMITS.parts) errors.push('parts-limit');
  for (const raw of rawParts.slice(0, LIMITS.parts)) {
    const q = raw as Record<string, unknown>;
    if (!q || typeof q !== 'object') {
      errors.push('part');
      continue;
    }
    const pid = isNum(q.id) ? Math.floor(q.id) : 0;
    const p = vec(q.p, LIMITS.extent, null);
    if (pid < 1 || ids.has(pid) || !p) {
      errors.push('part-id');
      continue;
    }
    const base: PartBase = { id: pid, p };
    const r = vec(q.r, 360, null);
    if (r && (r[0] || r[1] || r[2])) base.r = r;
    const sDef: Vec3 = [1, 1, 1];
    const s = vec(q.s, LIMITS.maxSize, sDef)!;
    for (let i = 0; i < 3; i++) if (Math.abs(s[i]) < LIMITS.minSize) s[i] = LIMITS.minSize * Math.sign(s[i] || 1);
    if (s[0] !== 1 || s[1] !== 1 || s[2] !== 1) base.s = s;
    if (isNum(q.m) && q.m > 0) base.m = Math.min(materials.length - 1, Math.floor(q.m));
    if (isNum(q.g) && q.g > 0) base.g = Math.floor(q.g);
    if (isNum(q.layer) && q.layer > 0) base.layer = clamp(Math.floor(q.layer), 0, 7);
    if (q.phys === 'dynamic' || q.phys === 'none') base.phys = q.phys;
    if ((ROLES as readonly string[]).includes(q.role as string)) base.role = q.role as PartRole;
    const nm = str(q.name, LIMITS.nameLen);
    if (nm) base.name = nm;
    if (q.hide === true) base.hide = true;
    if ((PRIMS as readonly string[]).includes(q.t as string)) {
      parts.push({ ...base, t: q.t as PrimType });
    } else if (q.t === 'stroke') {
      const pts = Array.isArray(q.pts) ? (q.pts as unknown[]).filter(isNum).slice(0, LIMITS.strokePoints * 3) : [];
      const n = Math.floor(pts.length / 3) * 3;
      if (n < 6) {
        errors.push('stroke');
        continue;
      }
      const w = isNum(q.w) ? clamp(q.w, 0.01, 2) : 0.05;
      parts.push({ ...base, t: 'stroke', pts: pts.slice(0, n).map((x) => clamp(x, -LIMITS.maxSize, LIMITS.maxSize)), w });
    } else if (q.t === 'ref') {
      const ref = typeof q.ref === 'string' && ID_RE.test(q.ref) ? q.ref : '';
      if (!ref || ref === id) {
        errors.push('ref');
        continue;
      }
      const rp: RefPart = { ...base, t: 'ref', ref };
      if (typeof q.h === 'string' && /^[0-9a-f]{1,32}$/.test(q.h)) rp.h = q.h;
      parts.push(rp);
    } else {
      errors.push('part-type');
      continue;
    }
    ids.add(pid);
  }

  const joints: Joint[] = [];
  const jids = new Set<number>();
  if (Array.isArray(o.joints))
    for (const raw of o.joints.slice(0, LIMITS.joints)) {
      const j = raw as Record<string, unknown>;
      const jid = isNum(j?.id) ? Math.floor(j.id) : 0;
      const k = j?.k === 'hinge' || j?.k === 'slider' || j?.k === 'fixed' ? j.k : null;
      const a = isNum(j?.a) ? j.a : -1;
      const b = isNum(j?.b) ? j.b : -1;
      const at = vec(j?.at, LIMITS.extent, null);
      if (jid < 1 || jids.has(jid) || !k || !ids.has(a) || (b !== 0 && !ids.has(b)) || a === b || !at) {
        errors.push('joint');
        continue;
      }
      const jj: Joint = { id: jid, k, a, b, at };
      const axis = vec(j.axis, 1, null);
      if (axis && Math.hypot(...axis) > 1e-3) jj.axis = axis;
      if (Array.isArray(j.lim) && j.lim.length === 2 && j.lim.every(isNum)) jj.lim = [Math.min(j.lim[0], j.lim[1]), Math.max(j.lim[0], j.lim[1])];
      const mo = j.motor as Record<string, unknown> | undefined;
      if (mo && isNum(mo.speed)) jj.motor = { speed: clamp(mo.speed, -50, 50), force: isNum(mo.force) ? clamp(mo.force, 0, 1e5) : undefined, on: mo.on === false ? false : undefined };
      joints.push(jj);
      jids.add(jid);
    }

  const logic: LogicRule[] = [];
  const AK: ActionKind[] = ['door', 'move', 'light', 'teleport', 'spawn', 'sound', 'score', 'motor', 'win'];
  if (Array.isArray(o.logic))
    for (const raw of o.logic.slice(0, LIMITS.logic)) {
      const L = raw as Record<string, unknown>;
      const on = L?.on as Record<string, unknown> | undefined;
      const tk = on?.k;
      if (!isNum(L?.id) || (tk !== 'button' && tk !== 'zone' && tk !== 'timer' && tk !== 'start')) {
        errors.push('logic');
        continue;
      }
      const trig: Trigger = { k: tk };
      if (tk === 'button' || tk === 'zone') {
        if (!isNum(on!.part) || !ids.has(on!.part)) {
          errors.push('logic-part');
          continue;
        }
        trig.part = on!.part;
      }
      if (tk === 'timer') trig.sec = clamp(isNum(on!.sec) ? on!.sec : 3, 0.5, 600);
      const acts: Action[] = [];
      if (Array.isArray(L.do))
        for (const ar of L.do.slice(0, LIMITS.actionsPerRule)) {
          const a = ar as Record<string, unknown>;
          if (!AK.includes(a?.k as ActionKind)) continue;
          const act: Action = { k: a.k as ActionKind };
          if (isNum(a.part) && ids.has(a.part)) act.part = a.part;
          if (isNum(a.joint) && jids.has(a.joint)) act.joint = a.joint;
          const d = vec(a.d, 100, null);
          if (d) act.d = d;
          if (isNum(a.n)) act.n = clamp(Math.round(a.n), -1000, 1000);
          if ((SOUNDS as readonly string[]).includes(a.snd as string)) act.snd = a.snd as SoundId;
          const needsPart = act.k === 'door' || act.k === 'move' || act.k === 'light' || act.k === 'teleport' || act.k === 'spawn';
          if ((needsPart && act.part == null) || (act.k === 'motor' && act.joint == null)) continue;
          acts.push(act);
        }
      if (!acts.length) {
        errors.push('logic-empty');
        continue;
      }
      logic.push({ id: Math.floor(L.id as number), on: trig, do: acts });
    }

  const c: Creation = {
    v: FORMAT_VERSION,
    id,
    kind,
    name: str(o.name, LIMITS.nameLen) || '?',
    author: str(o.author, 24),
    parts,
    joints,
    logic,
    materials,
  };
  const aid = str(o.authorId, 64);
  if (aid) c.authorId = aid;
  if (typeof o.thumbnail === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(o.thumbnail) && o.thumbnail.length <= LIMITS.thumbBytes * 1.4) c.thumbnail = o.thumbnail;
  if (o.worldKind === 'infinite' || o.worldKind === 'flat' || o.worldKind === 'void') c.worldKind = o.worldKind;
  if (isNum(o.seed)) c.seed = Math.floor(o.seed) | 0;
  if (typeof o.from === 'string' && ID_RE.test(o.from)) c.from = o.from;
  if (isNum(o.created)) c.created = o.created;
  if (isNum(o.updated)) c.updated = o.updated;
  if (Array.isArray(o.deps) && depth === 0) {
    const deps: Creation[] = [];
    for (const d of o.deps.slice(0, LIMITS.deps)) {
      const r = validate(d, depth + 1);
      if (r.creation && r.creation.id !== id) {
        delete r.creation.deps;
        deps.push(r.creation);
      } else errors.push('dep');
    }
    if (deps.length) c.deps = deps;
  }
  if (jsonBytes(c) > LIMITS.bytes) errors.push('bytes');
  return { ok: errors.length === 0, errors, creation: c };
}

/* --------------------------- (de)serialização --------------------------- */

/** Arredonda números para deixar o JSON compacto (mm / 0,1°). */
function compactNumbers(c: Creation): Creation {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const v3 = (v: Vec3, f: (x: number) => number): Vec3 => [f(v[0]), f(v[1]), f(v[2])];
  const parts = c.parts.map((p) => {
    const q = { ...p } as Part;
    q.p = v3(p.p, r3);
    if (p.r) q.r = v3(p.r, r1);
    if (p.s) q.s = v3(p.s, r3);
    if (q.t === 'stroke') (q as StrokePart).pts = (p as StrokePart).pts.map((x) => Math.round(x * 100) / 100);
    return q;
  });
  return { ...c, parts, joints: c.joints.map((j) => ({ ...j, at: v3(j.at, r3) })) };
}

export function jsonBytes(c: Creation): number {
  const s = JSON.stringify(c);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const hasCompression = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/**
 * Serializa para texto compacto e seguro para URL:
 *   "B1." + base64url(deflate-raw(JSON))  quando CompressionStream existe;
 *   "B0." + base64url(JSON)               senão.
 * A miniatura vai junto (tire-a antes se quiser algo menor).
 */
export async function serialize(c: Creation): Promise<string> {
  const json = JSON.stringify(compactNumbers(c));
  const bytes = new TextEncoder().encode(json);
  if (hasCompression()) {
    try {
      return 'B1.' + b64urlEncode(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* cai para sem compressão */
    }
  }
  return 'B0.' + b64urlEncode(bytes);
}

/** Inverso de serialize(); também aceita JSON puro. Sempre valida. Lança Error('format') se ilegível. */
export async function deserialize(s: string): Promise<ValidateResult> {
  let json: string;
  const txt = s.trim();
  if (txt.startsWith('{')) json = txt;
  else if (txt.startsWith('B0.')) json = new TextDecoder().decode(b64urlDecode(txt.slice(3)));
  else if (txt.startsWith('B1.')) {
    if (!hasCompression()) throw new Error('format');
    const raw = b64urlDecode(txt.slice(3));
    if (raw.length > LIMITS.bytes) throw new Error('format');
    json = new TextDecoder().decode(await pipe(raw, new DecompressionStream('deflate-raw')));
  } else throw new Error('format');
  if (json.length > LIMITS.bytes * 1.2) throw new Error('format');
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('format');
  }
  return validate(migrate(obj));
}

/** Atualiza versões antigas do formato (hoje só existe a v1). */
export function migrate(o: unknown): unknown {
  return o;
}

/* -------------------------------- hash -------------------------------- */

/** JSON canônico: chaves ordenadas, sem miniatura/datas/deps (o "conteúdo" da criação). */
export function canonical(c: Creation): string {
  const { thumbnail: _t, created: _c, updated: _u, deps: _d, ...rest } = compactNumbers(c);
  void _t;
  void _c;
  void _u;
  void _d;
  return stableStringify(rest);
}

function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  const o = x as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k]))
      .join(',') +
    '}'
  );
}

/** Hash estável (cyrb53, 53 bits → 14 dígitos hex) do conteúdo canônico. Igual em qualquer máquina. */
export function hashCreation(c: Creation): string {
  return cyrb53(canonical(c)).toString(16).padStart(14, '0');
}

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/* ------------------------------ utilidades ------------------------------ */

/** Ids de criações referenciadas (diretas). */
export function refIds(c: Creation): string[] {
  const s = new Set<string>();
  for (const p of c.parts) if (p.t === 'ref') s.add(p.ref);
  return [...s];
}

/** Resolve uma referência: primeiro nas deps embutidas, depois no resolvedor externo. */
export function findDep(c: Creation, id: string): Creation | undefined {
  return c.deps?.find((d) => d.id === id);
}

/** É um veículo jogável? (assento + rodas ou propulsores) */
export function isVehicle(c: Creation): boolean {
  const seat = c.parts.some((p) => p.role === 'seat');
  return seat && c.parts.some((p) => p.role === 'wheel' || p.role === 'thruster');
}

/** Contagem de peças "pesadas" (importadas contam pelo tamanho real). */
export function partCount(c: Creation, resolve?: (id: string) => Creation | undefined, depth = 0): number {
  let n = 0;
  for (const p of c.parts) {
    if (p.t === 'ref' && depth < LIMITS.refDepth) {
      const d = findDep(c, p.ref) ?? resolve?.(p.ref);
      n += d ? Math.max(1, partCount(d, resolve, depth + 1)) : 1;
    } else n++;
  }
  return n;
}
