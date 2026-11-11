/* ============================================================
 *  GARIMPO — ESTRADA PROCEDURAL (determinística por semente + destino).
 *  Linha central amostrada a cada 2 m: retas e curvas com transição suave
 *  (curvatura em rampa), morros suaves (rampa até ~7%), pontes sobre rios,
 *  postos, paradas de descanso, cidades e o destino no fim. Pátio reto no começo.
 *  Consulta sem alocação: sample(s, out), project(x, z, guess) → s e deslocamento lateral.
 * ============================================================ */
export const DS = 2;
export const YARD = 140;
export const HALF = 5.6; // meia-largura do asfalto (2 faixas + acostamento pintado)
export const SHOULDER = 7.5;

export type StopKind = 'station' | 'rest' | 'town' | 'dest';
export interface Stop {
  s: number;
  kind: StopKind;
  side: 1 | -1;
  /** nome de cidade (índice em TOWN_NAMES) */
  name: number;
}
export interface Bridge {
  s0: number;
  s1: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Road {
  readonly L: number;
  readonly n: number;
  readonly X: Float32Array;
  readonly Z: Float32Array;
  readonly Y: Float32Array;
  readonly H: Float32Array;
  readonly K: Float32Array;
  readonly stops: Stop[] = [];
  readonly bridges: Bridge[] = [];
  /** pontos para RAMPA DE ESCAPE (fim de descidas longas): s e lado livre (+1 esquerda / -1 direita) */
  readonly ramps: { s: number; side: 1 | -1; drop: number }[] = [];
  readonly seed: number;
  private ph: number[];

  constructor(seed: number, km: number) {
    this.seed = seed;
    const R = rng(seed * 2654435761 + Math.round(km * 1000));
    this.L = Math.round(km * 1000);
    const total = this.L + 260 + YARD;
    this.n = Math.ceil(total / DS) + 1;
    const n = this.n;
    this.X = new Float32Array(n);
    this.Z = new Float32Array(n);
    this.Y = new Float32Array(n);
    this.H = new Float32Array(n);
    this.K = new Float32Array(n);
    this.ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
    // curvatura: segmentos reta / curva (rampas de 50 m)
    let s = 0;
    const segs: [number, number, number][] = [];
    let dir = R() < 0.5 ? 1 : -1;
    while (s < this.L + 200) {
      const straight = 120 + R() * 260;
      segs.push([s, s + straight, 0]);
      s += straight;
      const rad = 140 + R() * 300;
      const len = 90 + R() * 220;
      if (R() < 0.75) dir = -dir;
      segs.push([s, s + len, dir / rad]);
      s += len;
    }
    const kAt = (x: number) => {
      for (const [a, b, k] of segs) {
        if (x < a || x >= b || k === 0) continue;
        return k * ss(a, a + 50, x) * (1 - ss(b - 50, b, x));
      }
      return 0;
    };
    // pontes (longe do pátio e do destino), evitando curvas fortes
    for (let b = 700 + R() * 500; b < this.L - 300; b += 1000 + R() * 900) this.bridges.push({ s0: b, s1: b + 50 + R() * 40 });
    // paradas
    let name = Math.floor(R() * 20);
    for (let p = 900 + R() * 300; p < this.L - 400; p += 1300 + R() * 500) {
      const k = this.stops.length % 3;
      const kind: StopKind = k === 1 ? 'rest' : k === 2 ? 'town' : 'station';
      while (this.bridges.some((br) => p > br.s0 - 140 && p < br.s1 + 140)) p += 60;
      if (p > this.L - 400) break;
      this.stops.push({ s: p, kind, side: R() < 0.5 ? 1 : -1, name: name++ % 20 });
    }
    this.stops.push({ s: this.L, kind: 'dest', side: 1, name: 0 });
    // integra
    let x = 0;
    let z = -YARD;
    let h = 0;
    for (let i = 0; i < n; i++) {
      const si = i * DS - YARD;
      let k = si < 40 ? 0 : kAt(si);
      // paradas e pontes ficam em reta
      for (const st of this.stops) if (Math.abs(si - st.s) < 110) k *= ss(60, 110, Math.abs(si - st.s));
      for (const br of this.bridges) if (si > br.s0 - 80 && si < br.s1 + 80) k *= 0.15;
      this.K[i] = k;
      this.X[i] = x;
      this.Z[i] = z;
      this.H[i] = h;
      this.Y[i] = this.elev(si);
      h += k * DS;
      x += Math.sin(h) * DS;
      z += Math.cos(h) * DS;
    }
    // rampas de escape: onde a pista desceu > 14 m nos últimos 400 m (freio pode falhar)
    const look = Math.round(400 / DS);
    let last = -1e9;
    for (let i = look; i < n; i++) {
      const si = i * DS - YARD;
      if (si < 300 || si > this.L - 200) continue;
      const drop = this.Y[i - look] - this.Y[i];
      const still = this.Y[Math.min(n - 1, i + 10)] < this.Y[i];
      if (drop > 14 && still && si - last > 700 && !this.stops.some((st) => Math.abs(st.s - si) < 150) && !this.bridges.some((b) => si > b.s0 - 80 && si < b.s1 + 80)) {
        // lado de fora da curva (ou direita na reta)
        const side: 1 | -1 = this.K[i] > 0.0005 ? -1 : this.K[i] < -0.0005 ? 1 : -1;
        this.ramps.push({ s: si, side, drop: Math.round(drop) });
        last = si;
      }
    }
  }

  private elev(s: number): number {
    if (s < 0) return 0;
    const p = this.ph;
    let y = Math.sin((s / 900) * 6.283 + p[0]) * 11 + Math.sin((s / 380) * 6.283 + p[1]) * 3.5 + Math.sin((s / 1700) * 6.283 + p[2]) * 9;
    y -= Math.sin(p[0]) * 11 + Math.sin(p[1]) * 3.5 + Math.sin(p[2]) * 9;
    y *= ss(0, 250, s);
    // pontes e paradas mais planas
    for (const br of this.bridges) {
      const m = (br.s0 + br.s1) / 2;
      const w = 1 - ss(0, 140, Math.abs(s - m) - (br.s1 - br.s0) / 2);
      if (w > 0) y = y * (1 - w) + this.elevRaw(m) * w;
    }
    return y;
  }
  private elevRaw(s: number): number {
    const p = this.ph;
    let y = Math.sin((s / 900) * 6.283 + p[0]) * 11 + Math.sin((s / 380) * 6.283 + p[1]) * 3.5 + Math.sin((s / 1700) * 6.283 + p[2]) * 9;
    y -= Math.sin(p[0]) * 11 + Math.sin(p[1]) * 3.5 + Math.sin(p[2]) * 9;
    return y * ss(0, 250, s);
  }

  /** índice + fração do ponto s */
  private at(s: number): [number, number] {
    const f = (s + YARD) / DS;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(f)));
    return [i, Math.max(0, Math.min(1, f - i))];
  }
  /** ponto central em s → out = [x, y, z, heading, curvatura] */
  sample(s: number, out: Float32Array | number[]): void {
    const [i, f] = this.at(s);
    const g = 1 - f;
    out[0] = this.X[i] * g + this.X[i + 1] * f;
    out[1] = this.Y[i] * g + this.Y[i + 1] * f;
    out[2] = this.Z[i] * g + this.Z[i + 1] * f;
    out[3] = this.H[i] * g + this.H[i + 1] * f;
    out[4] = this.K[i];
  }
  /** inclinação (dy/ds) em s */
  grade(s: number): number {
    const [i] = this.at(s);
    return (this.Y[i + 1] - this.Y[i]) / DS;
  }
  /** s mais próximo de (x,z) procurando perto de `guess`; lat = deslocamento lateral (+ = esquerda) */
  project(x: number, z: number, guess: number, out: { s: number; lat: number }): void {
    let [i] = this.at(guess);
    let best = 1e18;
    let bi = i;
    for (let k = Math.max(0, i - 30); k <= Math.min(this.n - 1, i + 30); k++) {
      const dx = x - this.X[k];
      const dz = z - this.Z[k];
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        bi = k;
      }
    }
    i = Math.min(this.n - 2, bi);
    const h = this.H[i];
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const dx = x - this.X[i];
    const dz = z - this.Z[i];
    const along = dx * fx + dz * fz;
    out.s = i * DS - YARD + along;
    // esquerda = (cos h, -sin h) (frente +z, x para a esquerda do motorista)
    out.lat = dx * fz - dz * fx;
  }
  /** chão ao lado da pista (lat em m, + esquerda) */
  ground(s: number, lat: number, y0: number): number {
    const a = Math.abs(lat);
    if (a <= HALF + 0.4) return y0 - 0.02;
    let g = y0 - 0.25;
    const k = Math.min(1, (a - SHOULDER) / 26);
    if (a > SHOULDER) {
      const n = Math.sin(s * 0.013 + lat * 0.05 + this.ph[3]) * Math.sin(s * 0.007 - lat * 0.031) + 0.5 * Math.sin(s * 0.031 + lat * 0.09);
      g += k * (n * 7 + (a - SHOULDER) * 0.08);
    }
    for (const br of this.bridges) {
      const m = (br.s0 + br.s1) / 2;
      const w = (br.s1 - br.s0) / 2;
      const d = Math.abs(s - m);
      if (d < w + 40) g -= 7.5 * (1 - ss(w - 10, w + 40, d)) * (a > HALF ? 1 : 0.0);
    }
    return g;
  }
  bridgeAt(s: number): Bridge | null {
    for (const b of this.bridges) if (s > b.s0 - 2 && s < b.s1 + 2) return b;
    return null;
  }
  /** próxima parada depois de s */
  nextStop(s: number): Stop | null {
    for (const st of this.stops) if (st.s > s + 30) return st;
    return null;
  }
  stopAt(s: number, r = 45): Stop | null {
    for (const st of this.stops) if (Math.abs(st.s - s) < r) return st;
    return null;
  }
}
