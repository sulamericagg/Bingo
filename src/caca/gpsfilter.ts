/**
 * CAÇA BLOOP — filtro do GPS (puro, sem DOM; testável em Node).
 *
 * Por que o bonequinho "pulava de um lado para o outro": cada leitura crua do GPS erra 5–30 m para lados
 * aleatórios, e o jogo seguia cada uma. Agora:
 *  1. descarta leituras com precisão ruim (> 35 m), exceto no começo (sem nenhuma boa ainda) ou se o GPS
 *     só manda leituras ruins há muito tempo;
 *  2. descarta "saltos" impossíveis para quem está a pé (> 12 m/s além da precisão), até 3 seguidos;
 *  3. filtro de Kalman (posição, variância = precisão²; ruído de processo cresce com a velocidade);
 *  4. trava de parado: com velocidade ≈ 0, movimentos menores que a precisão são ignorados (só deriva lenta);
 *  5. rumo pelo deslocamento filtrado (≥ 3 m) com média angular, ou bússola quando parado;
 *  6. opcional: "gruda" na rua/calçada mais próxima quando andando a pé (só na saída — o estado não é alterado).
 */

export interface RawFix {
  lat: number;
  lon: number;
  /** precisão (m, raio 68%) */
  acc: number;
  /** m/s relatado pelo GPS (null se não houver) */
  speed: number | null;
  /** graus relatados (null se não houver) */
  heading: number | null;
  t: number;
}
export interface FilteredFix {
  lat: number;
  lon: number;
  acc: number;
  /** m/s suavizado */
  speed: number;
  /** graus, 0 = norte (null se ainda sem rumo) */
  heading: number | null;
  t: number;
  /** andando de verdade (passou da trava de parado) */
  moving: boolean;
  /** precisão ainda ruim (começo) */
  coarse: boolean;
}
export type Snapper = (lat: number, lon: number, maxM: number) => [number, number] | null;

export interface FilterOpts {
  maxAcc: number;
  staleMs: number;
  maxSpeed: number;
}
const DEF: FilterOpts = { maxAcc: 35, staleMs: 30000, maxSpeed: 12 };
const R = 6371008.8;
const D2R = Math.PI / 180;

function angDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

export class GpsFilter {
  private o: FilterOpts;
  private lat0 = 0;
  private lon0 = 0;
  private cosLat = 1;
  private x = 0;
  private y = 0;
  private v = 0; // variância (m²)
  private t = 0;
  private started = false;
  private good = false;
  private lastAccept = 0;
  private streak = 0;
  private spd = 0;
  private hd: number | null = null;
  private hx = 0;
  private hy = 0;
  private sx = 0;
  private sy = 0;
  private st = 0;
  private compass: number | null = null;
  private rej: { x: number; y: number } | null = null;
  private compassAt = 0;
  snap: Snapper | null = null;
  /** contadores (para depuração/teste) */
  stats = { in: 0, accepted: 0, poorAcc: 0, jumps: 0, held: 0 };

  constructor(opts: Partial<FilterOpts> = {}) {
    this.o = { ...DEF, ...opts };
  }
  reset(): void {
    this.started = false;
    this.good = false;
    this.hd = null;
    this.spd = 0;
  }
  /** bússola do aparelho (graus) — usada para o rumo quando parado */
  setCompass(deg: number | null, t = Date.now()): void {
    this.compass = deg;
    this.compassAt = t;
  }
  private toXY(lat: number, lon: number): [number, number] {
    return [(lon - this.lon0) * D2R * R * this.cosLat, (lat - this.lat0) * D2R * R];
  }
  private toLL(x: number, y: number): [number, number] {
    return [this.lat0 + y / (R * D2R), this.lon0 + x / (R * D2R * this.cosLat)];
  }

  /** Recebe uma leitura crua. Devolve a posição filtrada, ou null se a leitura foi descartada. */
  push(r: RawFix): FilteredFix | null {
    this.stats.in++;
    const acc = r.acc > 0 && Number.isFinite(r.acc) ? r.acc : 50;
    if (!this.started) {
      this.lat0 = r.lat;
      this.lon0 = r.lon;
      this.cosLat = Math.cos(r.lat * D2R);
      this.x = this.y = 0;
      this.v = acc * acc;
      this.t = r.t;
      this.sx = this.sy = 0;
      this.st = r.t;
      this.hx = this.hy = 0;
      this.started = true;
      this.good = acc <= this.o.maxAcc;
      this.lastAccept = r.t;
      this.stats.accepted++;
      return this.out(r.t, false, acc);
    }
    // 1) precisão ruim
    const poor = acc > this.o.maxAcc;
    if (poor && this.good && r.t - this.lastAccept < this.o.staleMs) {
      this.stats.poorAcc++;
      return null;
    }
    const dt = Math.max(0.05, (r.t - this.t) / 1000);
    const [mx, my] = this.toXY(r.lat, r.lon);
    const dx = mx - this.x;
    const dy = my - this.y;
    const d = Math.hypot(dx, dy);
    const sigma = Math.sqrt(this.v);
    // 2) salto impossível a pé
    const reported = r.speed !== null && r.speed >= 0 && Number.isFinite(r.speed) ? r.speed : null;
    const implied = Math.max(0, d - acc - sigma) / dt;
    const lim = Math.max(this.o.maxSpeed, this.spd * 1.6 + 4);
    let forced = false;
    if (implied > lim && (reported === null || reported < 6)) {
      // "saltos" seguidos na MESMA direção, cada vez mais longe = movimento rápido de verdade (carro/ônibus);
      // salto de reflexo (multipath) vai para lados aleatórios e é descartado
      const rj = this.rej;
      const consistent = !!rj && this.streak >= 2 && Math.hypot(rj.x - this.x, rj.y - this.y) < d && (rj.x - this.x) * dx + (rj.y - this.y) * dy > 0.7 * d * Math.hypot(rj.x - this.x, rj.y - this.y);
      if (!consistent && this.streak < 4) {
        this.streak++;
        this.rej = { x: mx, y: my };
        this.stats.jumps++;
        return null;
      }
      forced = true;
    }
    this.streak = 0;
    this.rej = null;
    // 3) Kalman — predição
    const q = Math.max(0.6, Math.min(8, Math.max(this.spd, reported ?? 0) + 0.6));
    this.v += dt * q * q;
    // 4) trava de parado
    const slow = (reported === null || reported < 0.6) && this.spd < 0.5;
    const jitter = slow && d < Math.max(acc * 0.9, 5);
    let K = this.v / (this.v + acc * acc);
    if (jitter) {
      K *= 0.06; // só deriva lenta (se estiver mesmo parado, o ponto fica parado)
      this.stats.held++;
    }
    if (forced) {
      K = 1;
      this.spd = Math.max(this.spd, d / Math.max(1, (r.t - this.lastAccept) / 1000));
      this.sx = mx;
      this.sy = my;
      this.st = r.t;
    }
    this.x += K * dx;
    this.y += K * dy;
    this.v = (1 - K) * this.v;
    if (!poor) this.good = true;
    this.t = r.t;
    this.lastAccept = r.t;
    this.stats.accepted++;
    // velocidade: deslocamento filtrado numa janela de ≥ 3 s, misturada à relatada
    const wdt = (r.t - this.st) / 1000;
    if (wdt >= 3) {
      const ws = Math.hypot(this.x - this.sx, this.y - this.sy) / wdt;
      const est = reported !== null ? 0.6 * reported + 0.4 * ws : ws;
      this.spd = this.spd * 0.4 + est * 0.6;
      this.sx = this.x;
      this.sy = this.y;
      this.st = r.t;
    } else if (reported !== null) this.spd = this.spd * 0.7 + reported * 0.3;
    // 5) rumo
    const hdx = this.x - this.hx;
    const hdy = this.y - this.hy;
    if (Math.hypot(hdx, hdy) >= 3 && !jitter) {
      const b = (Math.atan2(hdx, hdy) / D2R + 360) % 360;
      this.hd = this.hd === null ? b : (this.hd + angDiff(this.hd, b) * 0.45 + 360) % 360;
      this.hx = this.x;
      this.hy = this.y;
    } else if (this.spd > 1.2 && r.heading !== null && Number.isFinite(r.heading)) {
      this.hd = this.hd === null ? r.heading : (this.hd + angDiff(this.hd, r.heading) * 0.3 + 360) % 360;
    }
    return this.out(r.t, !jitter && this.spd > 0.35, acc);
  }

  private out(t: number, moving: boolean, acc: number): FilteredFix {
    let [lat, lon] = this.toLL(this.x, this.y);
    let heading = this.hd;
    if (!moving && this.compass !== null && t - this.compassAt < 3000) heading = this.compass;
    // 6) gruda na rua andando a pé (0,4–2,8 m/s)
    if (this.snap && moving && this.spd > 0.4 && this.spd < 2.8) {
      const s = this.snap(lat, lon, Math.min(12, Math.max(6, Math.sqrt(this.v) * 1.2)));
      if (s) {
        lat += (s[0] - lat) * 0.7;
        lon += (s[1] - lon) * 0.7;
      }
    }
    return { lat, lon, acc: Math.min(acc, Math.sqrt(this.v)), speed: this.spd, heading, t, moving, coarse: !this.good };
  }
}
