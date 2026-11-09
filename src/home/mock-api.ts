/* ============================================================
 *  HomeApi LOCAL (offline/dev): amigos de mentirinha, casas aleatórias,
 *  festa com bots que comem bolo e jogam comida. Tudo em localStorage.
 * ============================================================ */
import type { FriendInfo, FriendRequest, HandleCheck, HomeApi, HomeDesign, HomeState, MessItem, PartyEvent, PartyPeer, PartySession } from './api';
import { hashStr, randomDesign } from './catalog';

const KEY = 'bw-home-mock-v1';
interface MockSave {
  handle: string | null;
  friends: string[];
  requests: string[];
  sent: string[];
  design: HomeDesign | null;
  mess: Record<string, MessItem[]>;
}
const blank = (): MockSave => ({ handle: null, friends: ['f-lulu', 'f-theo', 'f-mia', 'f-zeca'], requests: ['f-nina', 'f-bento'], sent: [], design: null, mess: {} });
let S: MockSave = blank();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) S = { ...blank(), ...JSON.parse(raw) };
} catch {
  /* */
}
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* */
  }
};

const SKIN_POOL = ['bloop', 'mint', 'sunny', 'berry', 'ocean', 'grape', 'lava', 'robot'];
const PEOPLE: [string, string, string, number][] = [
  ['f-lulu', 'lulu', 'Lulu', 0.85],
  ['f-theo', 'theo_gamer', 'Theo', 0.1],
  ['f-mia', 'mia.star', 'Mia', 0],
  ['f-zeca', 'zeca', 'Zeca', 0.4],
  ['f-nina', 'nina_bolha', 'Nina', 0],
  ['f-bento', 'bento', 'Bento', 0.2],
  ['f-duda', 'duda', 'Duda', 0],
  ['f-kai', 'kai.blue', 'Kai', 0.6],
];
function person(id: string): FriendInfo | null {
  const p = PEOPLE.find((x) => x[0] === id);
  if (!p) return null;
  const h = hashStr(id);
  return {
    id,
    handle: p[1],
    name: p[2],
    skin: SKIN_POOL[h % SKIN_POOL.length],
    online: h % 3 !== 0,
    lastSeen: Date.now() - (h % 7) * 3600_000,
    houseMess: S.mess[id] ? Math.min(1, S.mess[id].length / 14) : p[3],
  };
}
const TAKEN = ['admin', 'bloop', 'lulu', 'theo_gamer', 'mia.star', 'zeca', 'nina_bolha', 'bento', 'duda', 'kai.blue', 'teamross', 'bloopworld'];
const BLOCKED = ['bobo', 'chato', 'feio', 'idiota', 'burro', 'xxx', 'sexo', 'merda', 'porra'];
const delay = <T>(v: T, ms = 220): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));

function check(h: string): HandleCheck {
  const s = h.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_.]{3,16}$/.test(s)) return { ok: false, reason: 'invalid', suggestions: [] };
  if (BLOCKED.some((b) => s.includes(b))) return { ok: false, reason: 'blocked', suggestions: [] };
  if (/\d{5,}/.test(s)) return { ok: false, reason: 'blocked', suggestions: [] }; // parece telefone
  if (TAKEN.includes(s) && s !== S.handle) {
    const base = s.replace(/[._]?\d*$/, '').slice(0, 12) || 'bloop';
    return { ok: false, reason: 'taken', suggestions: [base + '_' + ((hashStr(s) % 90) + 10), base + '.star', 'super_' + base.slice(0, 9), base + (new Date().getFullYear() % 100)] };
  }
  return { ok: true };
}

function friendMess(id: string): MessItem[] {
  if (S.mess[id]) return S.mess[id];
  const p = PEOPLE.find((x) => x[0] === id);
  const n = Math.round((p?.[3] ?? 0) * 14);
  const kinds: MessItem['kind'][] = ['cake', 'frosting', 'juice', 'crumbs', 'confetti', 'tomato', 'pie', 'balloon-pop'];
  const out: MessItem[] = [];
  let seed = hashStr(id);
  const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++)
    out.push({ id: 'm' + id + i, kind: kinds[i % kinds.length], room: r() < 0.6 ? 'party' : 'living', x: 30 + r() * 300, y: r() < 0.35 ? 60 + r() * 150 : 250 + r() * 150, r: 12 + r() * 12, rot: r() * 6 });
  return out;
}

export const mockApi: HomeApi = {
  async checkHandle(h) {
    return delay(check(h), 260);
  },
  async claimHandle(h) {
    const c = check(h);
    if (c.ok) {
      S.handle = h.trim().toLowerCase().replace(/^@/, '');
      persist();
    }
    return delay(c, 200);
  },
  myHandle: () => S.handle,
  async searchPlayer(h) {
    const s = h.trim().toLowerCase().replace(/^@/, '');
    const p = PEOPLE.find((x) => x[1] === s);
    return delay(p ? person(p[0]) : null);
  },
  async friends() {
    return delay(S.friends.map(person).filter((x): x is FriendInfo => !!x), 150);
  },
  async requests() {
    return delay(S.requests.map((id) => ({ from: person(id)!, at: Date.now() - (hashStr(id) % 50) * 60_000 })).filter((r) => r.from) as FriendRequest[], 120);
  },
  async addFriend(hOrId) {
    const s = hOrId.trim().toLowerCase().replace(/^@/, '');
    const p = PEOPLE.find((x) => x[1] === s || x[0] === hOrId);
    if (!p) return delay('not_found' as const);
    if (S.friends.includes(p[0])) return delay('already' as const);
    if (S.friends.length >= 100) return delay('limit' as const);
    S.sent.push(p[0]);
    // no mock, o amigo "aceita" na hora (2 s)
    setTimeout(() => {
      if (!S.friends.includes(p[0])) S.friends.push(p[0]);
      S.requests = S.requests.filter((x) => x !== p[0]);
      persist();
    }, 2000);
    persist();
    return delay('sent' as const);
  },
  async respond(fromId, accept) {
    S.requests = S.requests.filter((x) => x !== fromId);
    if (accept && !S.friends.includes(fromId)) S.friends.push(fromId);
    persist();
    return delay(true);
  },
  async removeFriend(id) {
    S.friends = S.friends.filter((x) => x !== id);
    persist();
    return delay(true);
  },
  async getHome(ownerId) {
    if (!ownerId || ownerId === 'me') {
      if (!S.design) return delay(null, 60);
      return delay<HomeState>({ ownerId: 'me', design: S.design, mess: S.mess.me ?? [], updatedAt: Date.now() }, 60);
    }
    return delay<HomeState>({ ownerId, design: randomDesign(hashStr(ownerId)), mess: friendMess(ownerId), updatedAt: Date.now() }, 180);
  },
  async saveDesign(d) {
    S.design = d;
    persist();
    return delay(true, 120);
  },
  async setMess(ownerId, mess) {
    S.mess[ownerId === S.handle ? 'me' : ownerId] = mess;
    persist();
    return delay(true, 80);
  },
  async joinParty(hostId, opts) {
    return delay(new MockParty(hostId, opts?.botsIfAlone ?? 3), 300);
  },
};

/* ---------------- festa local com bots ---------------- */
const BOT_NAMES: [string, string][] = [
  ['Lulu', 'lulu'],
  ['Theo', 'theo_gamer'],
  ['Mia', 'mia.star'],
  ['Zeca', 'zeca'],
];
export const PARTY_FOODS = ['cake', 'pie', 'tomato', 'juice', 'frosting'] as const;
export class MockParty implements PartySession {
  readonly online = false;
  readonly hostId: string;
  private peers: PartyPeer[] = [];
  private pcb: ((p: PartyPeer[]) => void)[] = [];
  private ecb: ((e: PartyEvent) => void)[] = [];
  private timer = 0;
  private me: Partial<PartyPeer> = {};
  private room = 'party';
  constructor(hostId: string, bots: number) {
    this.hostId = hostId;
    for (let i = 0; i < Math.min(4, bots); i++) {
      const [name, handle] = BOT_NAMES[i];
      this.peers.push({ id: 'bot-' + i, name, handle, skin: SKIN_POOL[(i * 3 + 1) % SKIN_POOL.length], x: 70 + i * 70, y: 330 + (i % 2) * 40, room: 'party', bot: true });
    }
    this.timer = window.setInterval(() => this.step(), 700);
  }
  /** deixa os bots só limparem (modo faxina) */
  calm = false;
  private step(): void {
    const r = Math.random;
    for (const p of this.peers) {
      p.room = this.me.room ?? this.room;
      if (r() < 0.45) {
        p.x = Math.max(30, Math.min(330, p.x + (r() - 0.5) * 90));
        p.y = Math.max(280, Math.min(400, p.y + (r() - 0.5) * 50));
      }
      if (!this.calm && r() < 0.18) {
        const food = PARTY_FOODS[Math.floor(r() * PARTY_FOODS.length)];
        const tx = this.me.x !== undefined && r() < 0.5 ? this.me.x : 40 + r() * 280;
        const ty = r() < 0.4 ? 80 + r() * 120 : 260 + r() * 140;
        const T = 0.9;
        this.emit({ t: 'throw', from: p.id, food, x: p.x, y: p.y - 30, vx: (tx - p.x) / T, vy: (ty - (p.y - 30)) / T });
      } else if (r() < 0.08) this.emit({ t: 'chat', by: p.id, code: ['rindo', 'uau', 'oi', 'coracao', 'joinha'][Math.floor(r() * 5)] });
      else if (!this.calm && r() < 0.06) this.emit({ t: 'eat', by: p.id, food: 'cake' });
    }
    this.pcb.forEach((f) => f(this.peers));
  }
  private emit(e: PartyEvent): void {
    this.ecb.forEach((f) => f(e));
  }
  send(s: Partial<PartyPeer>): void {
    this.me = { ...this.me, ...s };
  }
  event(e: PartyEvent): void {
    // bots reagem: emote de volta
    if (e.t === 'chat' && this.peers.length && Math.random() < 0.6) setTimeout(() => this.emit({ t: 'chat', by: this.peers[Math.floor(Math.random() * this.peers.length)].id, code: 'joinha' }), 700);
  }
  onPeers(cb: (p: PartyPeer[]) => void): void {
    this.pcb.push(cb);
    cb(this.peers);
  }
  onEvent(cb: (e: PartyEvent) => void): void {
    this.ecb.push(cb);
  }
  leave(): void {
    clearInterval(this.timer);
    this.pcb = [];
    this.ecb = [];
  }
}
