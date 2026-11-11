/**
 * NAVEGADOR DE SERVIDORES do Mundo Bloop — Durable Object `ServerDir` (binding SERVERS, instância única 'hub').
 *
 * Como o Minecraft/Roblox: uma lista de cartões (foto, nome, modo, jogadores/máx., amigos dentro). Um toque = entra.
 *  - OFICIAIS (sempre no ar): cada "vaga" (Sobrevivência, PvP Arena, Ilhas no Céu, Corrida de Obstáculos, Spleef,
 *    Esconde-esconde, Construção) tem várias instâncias de WorldRoom com código fixo `<PRE>X<nn>`
 *    (ex.: PVPXAA). `match(slot)` escolhe a instância mais cheia que ainda tem lugar e abre uma nova se todas lotarem.
 *  - DE JOGADOR (mundos online criados no jogo): aparecem só para o dono e os amigos dele (nunca em público).
 *  - DO BLOOP STUDIO ("Publicar como servidor"): um mapa/jogo da Loja vira servidor multijogador. Só aparece em
 *    público se o item da Loja estiver APROVADO na moderação (UgcHub); "só amigos" restringe a lista aos amigos.
 *
 * Os WorldRoom avisam aqui (beat) quem está dentro a cada entrada/saída e a cada minuto (alarme), e o anfitrião
 * manda uma foto do mundo (JPEG ≤ 30 KB) de tempos em tempos — guardada aqui em `th:<código>`.
 *
 * Rotas (index.ts):
 *   GET  /api/servers/list?id=            → { cards: Card[], now }
 *   POST /api/servers/match {id, slot}     → { code }        (entrar num oficial)
 *   GET  /api/servers/thumb?code=&v=       → image/jpeg
 *   POST /api/servers/publish {id, item, name?, max, pvp, friendsOnly, goal?} → { ok, code, status }
 *   POST /api/servers/unpublish {id, code} → { ok }
 */
import { DurableObject } from 'cloudflare:workers';
import { hub as friendsHub } from './friends';
import { safeName } from './moderation';
import { ugcHub } from './ugc-hub';
import { cleanName, HttpError, json, PLAYER_ID_RE, randomString, readJson } from './util';

export const SRV_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const THUMB_MAX = 40_960; // ≈ 30 KB de JPEG em base64
const THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const LIVE_MS = 3 * 60_000;
const ITEM_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface Slot {
  /** prefixo do código (3 letras do alfabeto) */
  pre: string;
  name: string;
  mode: string;
  mini: string;
  gen: { type: string; h: number; off: number[] };
  seed: number;
  max: number;
  pvp: boolean;
}
/** Servidores oficiais (sempre disponíveis). A ordem é a da lista "Em alta" quando vazios. */
export const SLOTS: Record<string, Slot> = {
  sobrev: { pre: 'SUR', name: 'Sobrevivência', mode: 'sobrevivencia', mini: '', gen: { type: 'normal', h: 1, off: [] }, seed: 424242, max: 8, pvp: false },
  pvp: { pre: 'PVP', name: 'PvP Arena', mode: 'pacifico', mini: 'pvp', gen: { type: 'plano', h: 1, off: [] }, seed: 1717, max: 8, pvp: true },
  ceu: { pre: 'CEU', name: 'Ilhas no Céu', mode: 'sobrevivencia', mini: 'ceu', gen: { type: 'flutuantes', h: 1, off: [] }, seed: 9090, max: 8, pvp: true },
  obby: { pre: 'PKR', name: 'Corrida de Obstáculos', mode: 'pacifico', mini: 'obby', gen: { type: 'plano', h: 1, off: [] }, seed: 3131, max: 8, pvp: false },
  spleef: { pre: 'SPL', name: 'Spleef de Blocos', mode: 'pacifico', mini: 'spleef', gen: { type: 'plano', h: 1, off: [] }, seed: 5151, max: 8, pvp: false },
  esconde: { pre: 'ESC', name: 'Esconde-esconde', mode: 'pacifico', mini: 'esconde', gen: { type: 'normal', h: 1, off: [] }, seed: 6262, max: 8, pvp: false },
  build: { pre: 'BLD', name: 'Construção', mode: 'criativo', mini: 'corrida', gen: { type: 'plano', h: 1, off: [] }, seed: 8282, max: 8, pvp: false },
};
const PRE_TO_SLOT = new Map(Object.entries(SLOTS).map(([k, s]) => [s.pre, k]));
/** vaga oficial do código (PVPXAB → 'pvp'), ou '' */
export function officialSlot(code: string): string {
  if (code.length !== 6 || code[3] !== 'X') return '';
  return PRE_TO_SLOT.get(code.slice(0, 3)) ?? '';
}
const instCode = (slot: string, i: number) => SLOTS[slot].pre + 'X' + ALPH[Math.floor(i / ALPH.length) % ALPH.length] + ALPH[i % ALPH.length];

export interface Peer {
  id: string;
  name: string;
  skin: string;
}
/** O que o WorldRoom conta sobre si (a cada entrada/saída/minuto). */
export interface Beat {
  code: string;
  name: string;
  mode: string;
  mini: string;
  max: number;
  pvp: boolean;
  owner: string;
  oname: string;
  ugc: string;
  players: Peer[];
}
interface RoomRec extends Beat {
  at: number;
  thV: number;
  thAt: number;
}
interface Pub {
  code: string;
  ugc: string;
  owner: string;
  oname: string;
  name: string;
  max: number;
  pvp: boolean;
  friendsOnly: boolean;
  goal: string;
  status: string;
  checked: number;
  created: number;
}
export interface Card {
  /** 'slot:<id>' (oficial) ou o código */
  key: string;
  kind: 'official' | 'user' | 'studio';
  slot?: string;
  code?: string;
  name: string;
  mode: string;
  mini: string;
  pvp: boolean;
  n: number;
  max: number;
  friends: Peer[];
  /** caminho da foto (relativo a /api) ou '' */
  th: string;
  owner?: string;
  mine?: boolean;
  status?: string;
  ugc?: string;
  friendsOnly?: boolean;
  goal?: string;
  /** criado/atualizado (para "novos") */
  at: number;
}

export class ServerDir extends DurableObject<Env> {
  private rooms: Map<string, RoomRec> | null = null;
  private pubs: Map<string, Pub> | null = null;
  /** reservas recentes do match (evita mandar 10 pessoas para a última vaga) */
  private resv = new Map<string, number[]>();

  private async load(): Promise<void> {
    if (this.rooms && this.pubs) return;
    const r = (await this.ctx.storage.get<RoomRec[]>('rooms')) ?? [];
    const p = (await this.ctx.storage.get<Pub[]>('pubs')) ?? [];
    this.rooms = new Map(r.map((x) => [x.code, x]));
    this.pubs = new Map(p.map((x) => [x.code, x]));
  }
  private saveT = 0;
  private async saveRooms(force = false): Promise<void> {
    const now = Date.now();
    // limpa salas de jogador vazias há muito tempo (as oficiais e publicadas ficam)
    for (const [k, r] of this.rooms!) if (!r.players.length && !officialSlot(k) && !this.pubs!.has(k) && now - r.at > 14 * 86400_000) this.rooms!.delete(k);
    if (!force && now - this.saveT < 5000) {
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + 6000);
      return;
    }
    this.saveT = now;
    await this.ctx.storage.put('rooms', [...this.rooms!.values()]);
  }
  async alarm(): Promise<void> {
    await this.load();
    await this.saveRooms(true);
  }
  private livePlayers(r: RoomRec | undefined, now: number): Peer[] {
    return r && now - r.at < LIVE_MS ? r.players : [];
  }

  async beat(b: Beat): Promise<void> {
    await this.load();
    const prev = this.rooms!.get(b.code);
    const rec: RoomRec = { ...b, players: b.players.slice(0, 16), at: Date.now(), thV: prev?.thV ?? 0, thAt: prev?.thAt ?? 0 };
    this.rooms!.set(b.code, rec);
    // quem chegou já ocupa a vaga reservada
    const rs = this.resv.get(b.code);
    if (rs && rs.length) rs.splice(0, Math.max(0, b.players.length - (prev?.players.length ?? 0)));
    await this.saveRooms();
  }

  async thumb(code: string, d: string): Promise<boolean> {
    if (!THUMB_RE.test(d) || d.length > THUMB_MAX) return false;
    await this.load();
    const r = this.rooms!.get(code);
    if (!r) return false;
    r.thV = (r.thV + 1) % 1e6;
    r.thAt = Date.now();
    await this.ctx.storage.put('th:' + code, d);
    await this.saveRooms();
    return true;
  }
  async getThumb(code: string): Promise<string | null> {
    return (await this.ctx.storage.get<string>('th:' + code)) ?? null;
  }

  /** Escolhe a instância oficial: a mais cheia que ainda tem lugar; senão a primeira vazia; senão uma nova. */
  async match(slot: string, avoid: string[] = []): Promise<string> {
    const s = SLOTS[slot];
    if (!s) throw new HttpError(400, 'bad_slot', 'Servidor desconhecido');
    await this.load();
    const now = Date.now();
    let best = '';
    let bestN = -1;
    let firstEmpty = '';
    for (let i = 0; i < 60; i++) {
      const code = instCode(slot, i);
      if (avoid.includes(code)) continue;
      const r = this.rooms!.get(code);
      const rs = (this.resv.get(code) ?? []).filter((t) => now - t < 12_000);
      this.resv.set(code, rs);
      const n = this.livePlayers(r, now).length + rs.length;
      if (!r && !firstEmpty) {
        firstEmpty = code;
        break;
      }
      if (n === 0 && !firstEmpty) firstEmpty = code;
      if (n > 0 && n < s.max && n > bestN) {
        best = code;
        bestN = n;
      }
    }
    const code = best || firstEmpty || instCode(slot, Math.floor(Math.random() * 60));
    (this.resv.get(code) ?? this.resv.set(code, []).get(code)!).push(now);
    return code;
  }

  /* ---------------- servidores publicados pelo Bloop Studio ---------------- */

  async publish(p: Omit<Pub, 'code' | 'checked' | 'created'>): Promise<{ code: string } | { error: string }> {
    await this.load();
    const mine = [...this.pubs!.values()].filter((x) => x.owner === p.owner);
    const same = mine.find((x) => x.ugc === p.ugc);
    if (!same && mine.length >= 6) return { error: 'too_many' };
    let code = same?.code ?? '';
    for (let i = 0; !code && i < 20; i++) {
      const c = 'S' + randomString(5, ALPH);
      if (!officialSlot(c) && !this.pubs!.has(c) && !this.rooms!.has(c)) code = c;
    }
    if (!code) return { error: 'busy' };
    const rec: Pub = { ...p, code, checked: Date.now(), created: same?.created ?? Date.now() };
    this.pubs!.set(code, rec);
    await this.ctx.storage.put('pubs', [...this.pubs!.values()]);
    return { code };
  }
  async unpublish(owner: string, code: string): Promise<boolean> {
    await this.load();
    const p = this.pubs!.get(code);
    if (!p || p.owner !== owner) return false;
    this.pubs!.delete(code);
    this.rooms!.delete(code);
    await this.ctx.storage.put('pubs', [...this.pubs!.values()]);
    await this.ctx.storage.delete('th:' + code);
    await this.saveRooms(true);
    return true;
  }
  async pub(code: string): Promise<Pub | null> {
    await this.load();
    return this.pubs!.get(code) ?? null;
  }
  /** publicados cujo estado de moderação precisa ser conferido de novo */
  async needCheck(): Promise<{ code: string; ugc: string }[]> {
    await this.load();
    const now = Date.now();
    return [...this.pubs!.values()].filter((p) => now - p.checked > (p.status === 'approved' ? 300_000 : 8_000)).map((p) => ({ code: p.code, ugc: p.ugc }));
  }
  async setStatus(st: Record<string, string>): Promise<void> {
    await this.load();
    const now = Date.now();
    let ch = false;
    for (const [code, s] of Object.entries(st)) {
      const p = this.pubs!.get(code);
      if (!p) continue;
      p.checked = now;
      if (s === 'gone') {
        this.pubs!.delete(code);
        ch = true;
      } else if (p.status !== s) (p.status = s), (ch = true);
    }
    await this.ctx.storage.put('pubs', [...this.pubs!.values()]);
    void ch;
  }

  /* ---------------- lista ---------------- */

  async list(pid: string, friends: string[]): Promise<Card[]> {
    await this.load();
    const now = Date.now();
    const fr = new Set(friends);
    const out: Card[] = [];
    const fIn = (ps: Peer[]) => ps.filter((p) => fr.has(p.id)).slice(0, 6);
    // oficiais: um cartão por vaga (soma das instâncias)
    for (const [slot, s] of Object.entries(SLOTS)) {
      let n = 0;
      const friendsIn: Peer[] = [];
      let th = '';
      let thAt = 0;
      for (let i = 0; i < 60; i++) {
        const r = this.rooms!.get(instCode(slot, i));
        if (!r) {
          if (i > 3) break;
          continue;
        }
        const ps = this.livePlayers(r, now);
        n += ps.length;
        friendsIn.push(...fIn(ps));
        if (r.thAt > thAt) (thAt = r.thAt), (th = `/servers/thumb?code=${r.code}&v=${r.thV}`);
      }
      out.push({ key: 'slot:' + slot, kind: 'official', slot, name: s.name, mode: s.mode, mini: s.mini, pvp: s.pvp, n, max: s.max, friends: friendsIn.slice(0, 6), th, at: 0 });
    }
    // publicados pelo Studio
    for (const p of this.pubs!.values()) {
      const mine = p.owner === pid;
      if (!mine && p.status !== 'approved') continue;
      if (!mine && p.friendsOnly && !fr.has(p.owner)) continue;
      const r = this.rooms!.get(p.code);
      const ps = this.livePlayers(r, now);
      out.push({
        key: p.code,
        kind: 'studio',
        code: p.code,
        name: p.name,
        mode: 'studio',
        mini: p.goal,
        pvp: p.pvp,
        n: ps.length,
        max: p.max,
        friends: fIn(ps),
        th: r?.thAt ? `/servers/thumb?code=${p.code}&v=${r.thV}` : `/ugc/thumb?id=${encodeURIComponent(p.ugc)}${mine && p.status !== 'approved' ? '&pid=' + encodeURIComponent(pid) : ''}`,
        owner: p.oname,
        mine,
        status: p.status,
        ugc: p.ugc,
        friendsOnly: p.friendsOnly,
        goal: p.goal,
        at: p.created,
      });
    }
    // mundos online de jogadores: só o dono e os amigos (quando tem gente dentro ou o dono é amigo)
    for (const r of this.rooms!.values()) {
      if (officialSlot(r.code) || this.pubs!.has(r.code) || r.ugc) continue;
      const mine = r.owner === pid;
      const ps = this.livePlayers(r, now);
      const fi = fIn(ps);
      if (!mine && !fi.length && !(fr.has(r.owner) && ps.length)) continue;
      out.push({ key: r.code, kind: 'user', code: r.code, name: r.name, mode: r.mode, mini: r.mini, pvp: r.pvp, n: ps.length, max: r.max, friends: fi, th: r.thAt ? `/servers/thumb?code=${r.code}&v=${r.thV}` : '', owner: r.oname, mine, at: r.at });
    }
    return out;
  }
}

/* ============================== rotas ============================== */

export const serverDir = (env: Env) => env.SERVERS.get(env.SERVERS.idFromName('hub'));

/** GET /api/servers/list?id= */
export async function serversList(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const pid = PLAYER_ID_RE.test(id) ? id : '';
  const dir = serverDir(env);
  // confere a moderação dos publicados (aprovado / recusado / escondido por denúncias)
  try {
    const chk = await dir.needCheck();
    if (chk.length) {
      const hub = ugcHub(env);
      const st: Record<string, string> = {};
      for (const c of chk.slice(0, 25)) {
        const a = await hub.access(c.ugc);
        st[c.code] = a ? a.status : 'gone';
      }
      await dir.setStatus(st);
    }
  } catch (e) {
    console.warn('servers: moderação', e);
  }
  let friends: string[] = [];
  if (pid) {
    try {
      friends = (await friendsHub(env).list(pid)).friends;
    } catch {
      friends = [];
    }
  }
  return json({ cards: await dir.list(pid, friends), now: Date.now() }, 200, { 'cache-control': 'no-store' });
}

/** POST /api/servers/match {id, slot, avoid?} */
export async function serversMatch(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; slot?: string; avoid?: string[] }>(req);
  if (!PLAYER_ID_RE.test(String(b.id ?? ''))) throw new HttpError(400, 'bad_id', 'id inválido');
  const avoid = Array.isArray(b.avoid) ? b.avoid.filter((c) => typeof c === 'string' && SRV_CODE_RE.test(c)).slice(0, 10) : [];
  return json({ code: await serverDir(env).match(String(b.slot ?? ''), avoid) });
}

/** GET /api/servers/thumb?code= */
export async function serversThumb(req: Request, env: Env): Promise<Response> {
  const code = new URL(req.url).searchParams.get('code') ?? '';
  if (!SRV_CODE_RE.test(code)) return new Response('não encontrado', { status: 404 });
  const d = await serverDir(env).getThumb(code);
  const m = d ? /^data:image\/jpeg;base64,(.+)$/.exec(d) : null;
  if (!m) return new Response('não encontrado', { status: 404 });
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff' } });
}

const GOALS = ['', 'coop', 'race', 'pvp', 'collect', 'survive'];

/** POST /api/servers/publish {id, item, name?, max, pvp, friendsOnly, goal} — um mapa da Loja vira servidor */
export async function serversPublish(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; item?: string; name?: string; max?: number; pvp?: boolean; friendsOnly?: boolean; goal?: string }>(req);
  const pid = String(b.id ?? '');
  const item = String(b.item ?? '');
  if (!PLAYER_ID_RE.test(pid) || !ITEM_RE.test(item)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  const a = await ugcHub(env).access(item);
  if (!a || a.type !== 'criacao' || a.author !== pid) throw new HttpError(404, 'not_found', 'Publique o mapa na Loja primeiro');
  if (a.status === 'rejected') return json({ ok: false, error: 'rejected' });
  const name = safeName(cleanName(String(b.name ?? ''))).slice(0, 32) || a.title;
  const max = Math.max(2, Math.min(12, Math.floor(Number(b.max) || 8)));
  const goal = GOALS.includes(String(b.goal ?? '')) ? String(b.goal ?? '') : '';
  const r = await serverDir(env).publish({ ugc: item, owner: pid, oname: a.aname, name, max, pvp: !!b.pvp, friendsOnly: !!b.friendsOnly, goal, status: a.status });
  if ('error' in r) return json({ ok: false, error: r.error });
  // a sala já nasce pronta (dono = autor; modo 'studio' com o item da Loja)
  await env.MUNDO.get(env.MUNDO.idFromName('room:' + r.code)).setup({ owner: pid, oname: a.aname, name, ugc: item, max, pvp: !!b.pvp, goal });
  return json({ ok: true, code: r.code, status: a.status });
}

/** POST /api/servers/unpublish {id, code} */
export async function serversUnpublish(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; code?: string }>(req);
  const pid = String(b.id ?? '');
  const code = String(b.code ?? '');
  if (!PLAYER_ID_RE.test(pid) || !SRV_CODE_RE.test(code)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  return json({ ok: await serverDir(env).unpublish(pid, code) });
}
