/* ============================================================
 *  BLOOP PINK — Minha Loja EM GRUPO (até 4 Bloops na loja do líder).
 *  Relé: server/raft.ts (mesma classe da Jangada, salas '/api/pink/room/<CÓDIGO>').
 *  O ANFITRIÃO (líder, dono do save) simula tudo: clientes, equipe, caminhão,
 *  dinheiro, dia. Os convidados andam pela loja, veem tudo e ajudam:
 *  tablet (pedidos, móveis, reforma, equipe, preços — o dinheiro é um só),
 *  colocar/mover móveis, esfregão, abrir/fechar a loja.
 *  Mensagens (campo t; `from` vem do servidor):
 *   'p'    {x,z,y,a,s,c}               posição (10 Hz, todos)
 *   'init' {s,h,ph}                    anfitrião → quem entrou: a loja (sem móveis/caixas)
 *   'rdy'  {}                          convidado → anfitrião: loja montada, manda tudo
 *   'fu'   {q,i,n,l}                   anfitrião → todos: móveis + estoque (em pedaços, quando muda)
 *   'mt'   {...}                       anfitrião → todos: reforma, licenças, equipe, preços, metas (quando muda)
 *   'st'   {m,xp,lv,d,h,ph,r,w,dt?,cn?} anfitrião → todos: dinheiro, relógio, clientes/equipe (5 Hz), sujeira (1 Hz)
 *   'bx'   {l}                         anfitrião → todos: caixas soltas (só desenho, 2 Hz)
 *   'act'  {o,a}                       convidado → anfitrião: pedido (comprar, colocar móvel, esfregar...)
 *   'end'  {}                          anfitrião → todos: a loja fechou (voltou ao menu)
 * ============================================================ */
import * as THREE from 'three';
import { npcSpec, PaperChar, specOf } from '../../3d/paper';
import type { JNet, NetEvent } from '../jangada/net';

export const PINK_NET_PATH = '/pink/room/';

export interface ShopNet {
  net: JNet;
  /** sou o dono da loja (o save é meu) */
  host: boolean;
}

/** visual de um cliente/funcionária: "cor1|cor2|chapéu" ('r' no fim = robô) */
export function lookSpec(look: string) {
  const [a, b, h] = look.split('|');
  if (h === 'r') return npcSpec(a || '#c0c8d8', b || '#6a7a8a', { eyes: 'e_cute' as never });
  return npcSpec(a || '#ff8cc0', b || '#ffffff', {
    head: (h || 'h_none') as never,
  });
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerpA = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/* ------------------------------ jogadores remotos ------------------------------ */
interface Remote {
  ch: PaperChar;
  x: number;
  z: number;
  y: number;
  a: number;
  tx: number;
  tz: number;
  ty: number;
  ta: number;
  sp: number;
  tag: HTMLDivElement;
  at: number;
}
export class Remotes {
  private m = new Map<string, Remote>();
  constructor(private scene: THREE.Scene, private layer: HTMLElement, private net: JNet) {}
  get size(): number {
    return this.m.size;
  }
  positions(): { x: number; z: number }[] {
    return [...this.m.values()].map((r) => ({ x: r.x, z: r.z }));
  }
  /** posição recebida (de quem `id`) */
  set(id: string, e: NetEvent): void {
    const x = Number(e.x);
    const z = Number(e.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    let r = this.m.get(id);
    if (!r) {
      const peer = this.net.peers.find((p) => p.id === id);
      const ch = new PaperChar(specOf(peer?.skin ?? 'bloop'), {
        radius: 0.42,
        cell: 96,
        shadow: true,
      });
      this.scene.add(ch.root);
      const tag = document.createElement('div');
      tag.className = 'pk-tag';
      this.layer.appendChild(tag);
      r = {
        ch,
        x,
        z,
        y: 0,
        a: 0,
        tx: x,
        tz: z,
        ty: 0,
        ta: 0,
        sp: 0,
        tag,
        at: 0,
      };
      this.m.set(id, r);
    }
    r.tx = x;
    r.tz = z;
    r.ty = Number(e.y) || 0;
    r.ta = Number(e.a) || 0;
    r.sp = Number(e.s) || 0;
    r.at = performance.now();
    const peer = this.net.peers.find((p) => p.id === id);
    const nm = peer?.name ?? 'Bloop';
    const lead = id === this.net.hostId;
    const html = `${lead ? '<i>♛</i>' : ''}${nm.replace(/[&<>"]/g, '')}`;
    if (r.tag.innerHTML !== html) {
      r.tag.innerHTML = html;
      r.tag.classList.toggle('lead', lead);
    }
  }
  remove(id: string): void {
    const r = this.m.get(id);
    if (!r) return;
    r.ch.root.removeFromParent();
    r.ch.dispose();
    r.tag.remove();
    this.m.delete(id);
  }
  update(dt: number, cam: THREE.Camera, toScreen: (x: number, y: number, z: number) => [number, number] | null): void {
    const k = Math.min(1, dt * 10);
    const now = performance.now();
    for (const [id, r] of this.m) {
      if (now - r.at > 12_000 && !this.net.peers.some((p) => p.id === id)) {
        this.remove(id);
        continue;
      }
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      r.y += (r.ty - r.y) * k;
      r.a = lerpA(r.a, r.ta, k);
      r.ch.root.position.set(r.x, r.y, r.z);
      r.ch.update(dt, cam, { yaw: r.a, speed: r.sp, act: -1 });
      const sc = toScreen(r.x, r.y + 1.25, r.z);
      if (sc) {
        r.tag.style.transform = `translate(${sc[0]}px,${sc[1]}px) translate(-50%,-100%)`;
        r.tag.style.display = '';
      } else r.tag.style.display = 'none';
    }
  }
  dispose(): void {
    for (const id of [...this.m.keys()]) this.remove(id);
  }
}

/* ------------------------------ clientes/equipe vistos pelo convidado ------------------------------ */
interface Ghost {
  ch: PaperChar;
  look: string;
  x: number;
  z: number;
  a: number;
  tx: number;
  tz: number;
  ta: number;
  v: number;
}
/** linha de 'st'.w: [id, x, z, yaw, velocidade, visual] */
export type GhostRow = [string, number, number, number, number, string];
export class Ghosts {
  private m = new Map<string, Ghost>();
  constructor(private scene: THREE.Scene) {}
  sync(rows: GhostRow[]): void {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [id, x, z, a, v, look] = row;
      seen.add(id);
      let g = this.m.get(id);
      if (g && g.look !== look) {
        this.drop(id);
        g = undefined;
      }
      if (!g) {
        const ch = new PaperChar(lookSpec(String(look)), {
          radius: 0.36,
          cell: 96,
          shadow: true,
        });
        this.scene.add(ch.root);
        g = { ch, look: String(look), x, z, a, tx: x, tz: z, ta: a, v };
        this.m.set(id, g);
      }
      g.tx = x;
      g.tz = z;
      g.ta = a;
      g.v = v;
    }
    for (const id of [...this.m.keys()]) if (!seen.has(id)) this.drop(id);
  }
  positions(): { x: number; z: number }[] {
    return [...this.m.values()].map((g) => ({ x: g.x, z: g.z }));
  }
  private drop(id: string): void {
    const g = this.m.get(id);
    if (!g) return;
    g.ch.root.removeFromParent();
    g.ch.dispose();
    this.m.delete(id);
  }
  update(dt: number, cam: THREE.Camera): void {
    const k = Math.min(1, dt * 6);
    for (const g of this.m.values()) {
      g.x += (g.tx - g.x) * k;
      g.z += (g.tz - g.z) * k;
      g.a = lerpA(g.a, g.ta, k);
      g.ch.root.position.set(g.x, 0, g.z);
      g.ch.update(dt, cam, { yaw: g.a, speed: g.v, act: -1 });
    }
  }
  dispose(): void {
    for (const id of [...this.m.keys()]) this.drop(id);
  }
}

/* ------------------------------ caixas soltas (só desenho) ------------------------------ */
/** linha de 'bx': [produto, quantidade, aberta, x, y, z, qx, qy, qz, qw] */
export type BoxRow = [string, number, number, number, number, number, number, number, number, number];
export function boxRow(p: string, n: number, open: boolean, pos: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }): BoxRow {
  return [p, n, open ? 1 : 0, r2(pos.x), r2(pos.y), r2(pos.z), r2(q.x), r2(q.y), r2(q.z), r2(q.w)];
}
export class BoxViews {
  private list: { key: string; g: THREE.Group }[] = [];
  constructor(private scene: THREE.Scene, private make: (p: string, n: number, open: boolean) => THREE.Group) {}
  sync(rows: BoxRow[]): void {
    while (this.list.length > rows.length) this.list.pop()!.g.removeFromParent();
    rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length < 10) return;
      const key = `${r[0]}|${Math.min(6, r[1])}|${r[2]}`;
      let it = this.list[i];
      if (!it || it.key !== key) {
        it?.g.removeFromParent();
        it = { key, g: this.make(String(r[0]), r[1], !!r[2]) };
        this.scene.add(it.g);
        this.list[i] = it;
      }
      it.g.position.set(r[3], r[4], r[5]);
      it.g.quaternion.set(r[6], r[7], r[8], r[9]).normalize();
    });
  }
  dispose(): void {
    for (const it of this.list) it.g.removeFromParent();
    this.list = [];
  }
}

/** quebra uma lista em pedaços (o relé aceita mensagens de até 16 KB) */
export function chunks<T>(l: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < l.length; i += n) out.push(l.slice(i, i + n));
  return out.length ? out : [[]];
}
export { r2 };
