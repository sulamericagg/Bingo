/**
 * Presença "drop-in" — implementação de src/services/presence-api.ts (JoinPresence).
 *
 *   const ses = await joinPresence('orbit', { botsIfAlone: 2, seed });
 *   ses.onPeers((peers) => { ... });   // chamado a cada mudança (entrada/saída/estado/emote)
 *   ses.send({ x, y, a });             // ~5x/s (o servidor limita a 8/s)
 *   ses.emote('joinha');
 *   ses.leave();
 *
 * - Online: WebSocket /api/presence/<gameId> (Durable Object PresenceRoom, até 6 por sala).
 * - Offline / servidor fora: `online=false` e sessão vazia (ou só bots).
 * - BOTS (botsIfAlone>0): quando não há outro humano por ~3 s, a sessão cria bots LOCAIS.
 *   Eles trazem só a identidade (id 'bot-…', name, skin, bot:true) e `s: {}` — QUEM MOVE
 *   OS BOTS É O JOGO (simule com sua própria IA a partir do id/seed). A presença só faz
 *   bots mandarem um "oi"/"gg" de vez em quando. Quando um humano entra, os bots saem.
 * - Desempenho: o array entregue em onPeers é REUTILIZADO (não guarde referência entre
 *   chamadas; copie se precisar). `peer.emote` some sozinho após ~3 s.
 */
import type { JoinPresence, PeerState, PresenceSession } from './presence-api';
import { SKINS } from '../game/skins';
import { me, wsUrl } from '../social/net';
import { partyRoomFor } from '../party/contract';

const EMOTE_MS = 3000;
const BOT_DELAY_MS = 3000;
const CONNECT_TIMEOUT_MS = 4000;

/* nomes originais de bots: sílabas fofas + número */
const SYL_A = ['Bo', 'Pi', 'Lu', 'Zu', 'Mi', 'Ta', 'Ki', 'No', 'Fe', 'Ru', 'Ga', 'Ju'];
const SYL_B = ['lo', 'pa', 'ki', 'mi', 'zo', 'ri', 'na', 'bu', 'te', 'xi'];

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function botIdentity(seed: number, i: number): PeerState {
  const r = rng(seed * 31 + i * 7919 + 1);
  const name = SYL_A[Math.floor(r() * SYL_A.length)] + SYL_B[Math.floor(r() * SYL_B.length)] + (r() < 0.5 ? '' : String(10 + Math.floor(r() * 89)));
  const skins = SKINS.filter((s) => s.id !== 'custom');
  return { id: `bot-${i}`, name, skin: skins[Math.floor(r() * Math.min(skins.length, 14))]?.id ?? 'bloop', s: {}, bot: true };
}

class Session implements PresenceSession {
  online = false;
  private ws: WebSocket | null = null;
  private peers = new Map<string, PeerState & { emoteAt?: number }>();
  private out: PeerState[] = [];
  private cbs: ((p: PeerState[]) => void)[] = [];
  private botsTimer = 0;
  private emoteTimer = 0;
  private botChatter = 0;
  private closed = false;

  constructor(
    private gameId: string,
    private bots: number,
    private seed: number,
  ) {}

  async connect(): Promise<void> {
    let ident: Awaited<ReturnType<typeof me>>;
    try {
      ident = await me();
    } catch {
      ident = { id: '', name: 'Bloop', skin: 'bloop' };
    }
    if (ident.id && typeof WebSocket !== 'undefined') {
      await new Promise<void>((resolve) => {
        let ws: WebSocket;
        try {
          const pr = partyRoomFor(this.gameId); // grupo jogando junto (docs/PARTY.md)
          ws = new WebSocket(wsUrl('/presence/' + this.gameId + (pr ? '?party=' + encodeURIComponent(pr) : '')));
        } catch {
          return resolve();
        }
        const to = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* */
          }
          resolve();
        }, CONNECT_TIMEOUT_MS);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', ...ident }));
        ws.onmessage = (ev) => {
          let m: any;
          try {
            m = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (m.type === 'welcome') {
            clearTimeout(to);
            this.ws = ws;
            this.online = true;
            for (const p of m.peers) this.peers.set(p.id, { ...p, s: p.s ?? {} });
            resolve();
            this.changed();
          } else this.onMsg(m);
        };
        ws.onclose = () => {
          clearTimeout(to);
          resolve();
          if (this.ws === ws) {
            this.ws = null;
            this.online = false;
            for (const id of [...this.peers.keys()]) if (!id.startsWith('bot-')) this.peers.delete(id);
            this.changed();
          }
        };
        ws.onerror = () => {};
      });
    }
    this.scheduleBots();
  }

  private onMsg(m: any): void {
    if (m.type === 'join') {
      this.peers.set(m.p.id, { ...m.p, s: m.p.s ?? {} });
      this.removeBots();
    } else if (m.type === 'leave') this.peers.delete(m.id);
    else if (m.type === 's') {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.s = m.s;
    } else if (m.type === 'e') {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.emote = m.code;
      p.emoteAt = performance.now();
      this.armEmoteClear();
    } else return;
    this.changed();
    this.scheduleBots();
  }

  private humans(): number {
    let n = 0;
    for (const p of this.peers.values()) if (!p.bot) n++;
    return n;
  }

  private scheduleBots(): void {
    if (!this.bots || this.closed) return;
    clearTimeout(this.botsTimer);
    if (this.humans() > 0) return;
    this.botsTimer = window.setTimeout(() => {
      if (this.closed || this.humans() > 0) return;
      for (let i = 0; i < this.bots; i++) {
        const b = botIdentity(this.seed, i);
        if (!this.peers.has(b.id)) this.peers.set(b.id, b);
      }
      this.changed();
      this.startBotChatter();
    }, BOT_DELAY_MS);
  }

  private startBotChatter(): void {
    clearInterval(this.botChatter);
    const r = rng(this.seed ^ 0x9e3779b9);
    const codes = ['oi', 'vamos', 'joinha', 'uau', 'boa', 'gg', 'rindo', 'coracao'];
    this.botChatter = window.setInterval(() => {
      if (r() > 0.35) return;
      const bots = [...this.peers.values()].filter((p) => p.bot);
      if (!bots.length) return;
      const b = bots[Math.floor(r() * bots.length)];
      b.emote = codes[Math.floor(r() * codes.length)];
      b.emoteAt = performance.now();
      this.armEmoteClear();
      this.changed();
    }, 6000);
  }

  private removeBots(): void {
    clearInterval(this.botChatter);
    for (const id of [...this.peers.keys()]) if (id.startsWith('bot-')) this.peers.delete(id);
  }

  private armEmoteClear(): void {
    if (this.emoteTimer) return;
    this.emoteTimer = window.setTimeout(() => {
      this.emoteTimer = 0;
      const now = performance.now();
      let any = false;
      let pending = false;
      for (const p of this.peers.values()) {
        if (!p.emote) continue;
        if (now - (p.emoteAt ?? 0) >= EMOTE_MS) {
          p.emote = undefined;
          any = true;
        } else pending = true;
      }
      if (any) this.changed();
      if (pending) this.armEmoteClear();
    }, 500);
  }

  private changed(): void {
    this.out.length = 0;
    for (const p of this.peers.values()) this.out.push(p);
    for (const cb of this.cbs) cb(this.out);
  }

  send(s: Record<string, number>): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 's', s }));
  }
  emote(code: string): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'e', code }));
  }
  onPeers(cb: (peers: PeerState[]) => void): void {
    this.cbs.push(cb);
    if (this.peers.size) cb(this.out);
  }
  leave(): void {
    this.closed = true;
    clearTimeout(this.botsTimer);
    clearInterval(this.botChatter);
    clearTimeout(this.emoteTimer);
    this.cbs = [];
    const ws = this.ws;
    this.ws = null;
    this.online = false;
    try {
      ws?.close(1000, 'bye');
    } catch {
      /* */
    }
    this.peers.clear();
  }
}

export const joinPresence: JoinPresence = async (gameId, opts = {}) => {
  const s = new Session(gameId.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'game', Math.max(0, Math.min(5, opts.botsIfAlone ?? 0)), opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
  await s.connect();
  return s;
};
