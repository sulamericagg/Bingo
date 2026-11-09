/* ============================================================
 *  BANDA ONLINE — saguão + partida sincronizada via presença
 *  (src/services/presence.ts, carregado por import.meta.glob).
 *  Estado enviado ~5x/s (só números):
 *    ph fase (0 saguão, 1 tocando, 2 terminou) · in instrumento · rd pronto
 *    so hash da música · df dificuldade · at início combinado (Date.now ms)
 *    sc pontos · cb combo · h acertos · m erros · sp modo estrela · rk sorteio (anfitrião = maior)
 *  Sem internet: sessão vazia → a banda é completada com bots.
 * ============================================================ */
import type { PeerState, PresenceSession } from '../../services/presence-api';
import type { BandGame } from './game';
import { INSTRUMENTS, type Instrument } from './model';

export class BandNet {
  ses: PresenceSession | null = null;
  online = false;
  peers: PeerState[] = [];
  st: Record<string, number> = { ph: 0, in: 2, rd: 0, so: 0, df: 0, at: 0, sc: 0, cb: 0, h: 0, m: 0, sp: 0, rk: Math.floor(Math.random() * 1e9) };
  private timer = 0;
  private cbs: (() => void)[] = [];
  private seenH = new Map<string, number>();
  private seenM = new Map<string, number>();
  private seenE = new Map<string, string>();
  private left = false;

  async join(): Promise<void> {
    try {
      const mods = import.meta.glob('../../services/presence.ts');
      const load = Object.values(mods)[0];
      if (!load) return;
      const mod = (await load().catch(() => null)) as { joinPresence?: (id: string, o?: { botsIfAlone?: number }) => Promise<PresenceSession> } | null;
      if (!mod?.joinPresence || this.left) return;
      const s = await mod.joinPresence('band', { botsIfAlone: 0 });
      if (this.left) {
        s.leave();
        return;
      }
      this.ses = s;
      this.online = s.online;
      s.onPeers((ps) => {
        // array reutilizado: copia
        this.peers = ps.filter((p) => !p.bot).map((p) => ({ ...p, s: { ...p.s } }));
        for (const f of this.cbs) f();
      });
      this.timer = window.setInterval(() => this.ses?.send(this.st), 200);
      this.ses.send(this.st);
    } catch {
      this.ses = null;
      this.online = false;
    }
    for (const f of this.cbs) f();
  }

  onChange(cb: () => void): void {
    this.cbs.push(cb);
  }

  /** humanos no saguão (mesma fase) */
  lobbyPeers(): PeerState[] {
    return this.peers.filter((p) => (p.s.ph ?? 0) === 0 || (p.s.ph === 1 && (p.s.at ?? 0) > Date.now() - 3000)).slice(0, 3);
  }

  isHost(): boolean {
    return this.lobbyPeers().every((p) => (p.s.rk ?? 0) < this.st.rk);
  }

  host(): PeerState | null {
    let best: PeerState | null = null;
    for (const p of this.lobbyPeers()) if ((p.s.rk ?? 0) > this.st.rk && (!best || (p.s.rk ?? 0) > (best.s.rk ?? 0))) best = p;
    return best;
  }

  takenBy(inst: Instrument): PeerState | null {
    const i = INSTRUMENTS.indexOf(inst);
    return this.lobbyPeers().find((p) => (p.s.in ?? -1) === i) ?? null;
  }

  /** resolve conflito: quem tem rk menor troca para um livre */
  fixConflict(): boolean {
    const mine = INSTRUMENTS[this.st.in];
    const other = this.takenBy(mine);
    if (other && (other.s.rk ?? 0) > this.st.rk) {
      const free = INSTRUMENTS.find((i) => !this.takenBy(i));
      if (free) {
        this.st.in = INSTRUMENTS.indexOf(free);
        return true;
      }
    }
    return false;
  }

  setInst(i: Instrument): void {
    this.st.in = INSTRUMENTS.indexOf(i);
    this.push();
  }
  setReady(r: boolean): void {
    this.st.rd = r ? 1 : 0;
    this.push();
  }
  setSong(hash: number, diff: number): void {
    this.st.so = hash;
    this.st.df = diff;
    this.push();
  }
  scheduleStart(at: number): void {
    this.st.at = at;
    this.st.ph = 1;
    this.st.sc = this.st.cb = this.st.h = this.st.m = this.st.sp = 0;
    this.push();
  }
  beginPlay(at: number): void {
    this.st.at = at;
    this.st.ph = 1;
    this.st.sc = this.st.cb = this.st.h = this.st.m = this.st.sp = 0;
    this.seenH.clear();
    this.seenM.clear();
    this.push();
  }
  backToLobby(): void {
    this.st.ph = 0;
    this.st.rd = 0;
    this.st.at = 0;
    this.push();
  }
  report(score: number, combo: number, dh: number, dm: number): void {
    this.st.sc = Math.round(score);
    this.st.cb = combo;
    this.st.h += dh;
    this.st.m += dm;
  }
  setStar(on: boolean): void {
    this.st.sp = on ? 1 : 0;
  }
  finished(score: number): void {
    this.st.sc = score;
    this.st.ph = 2;
    this.push();
  }
  emote(code: string): void {
    this.ses?.emote(code);
  }
  private push(): void {
    this.ses?.send(this.st);
  }

  /** aplica eventos dos amigos na banda durante a música */
  tickPlay(g: BandGame): void {
    const now = performance.now() / 1000;
    for (const m of g.members) {
      if (!m.remote) {
        continue;
      }
      const p = this.peers.find((q) => q.id === m.pid);
      if (!p) continue;
      const h = p.s.h ?? 0;
      const mm = p.s.m ?? 0;
      const ph = this.seenH.get(p.id) ?? 0;
      const pm = this.seenM.get(p.id) ?? 0;
      if (h > ph) {
        m.hitT = now;
        g.player?.setTrackGain(m.inst, 1);
      }
      if (mm > pm) {
        m.missT = now;
        g.player?.setTrackGain(m.inst, 0.25);
        g.player?.miss(m.inst);
      }
      this.seenH.set(p.id, h);
      this.seenM.set(p.id, mm);
      m.score = p.s.sc ?? m.score;
      m.combo = p.s.cb ?? 0;
      m.star = (p.s.sp ?? 0) > 0;
      if (p.emote && this.seenE.get(p.id) !== p.emote) {
        m.emote = p.emote;
        m.emoteT = now;
      }
      this.seenE.set(p.id, p.emote ?? '');
    }
  }

  leave(): void {
    this.left = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    try {
      this.ses?.leave();
    } catch {
      /* */
    }
    this.ses = null;
  }
}
