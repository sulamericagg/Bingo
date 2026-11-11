/* ============================================================
 *  GARIMPO BRUTO — CLIMA E HORA compartilhados (só estado, sem three.js).
 *  Quem lê: céu/luzes (rp/sky.ts), necessidades, eventos, estrada, e quem mais
 *  precisar (água/represa, chuva no terreno). API pequena:
 *
 *    import { weather } from './weather';
 *    weather.hour        0..24 (hora do dia)          weather.day   dia nº (1, 2, …)
 *    weather.rain        0..1 chuva de verdade (suave) weather.storm 0..1 temporal
 *    weather.wind        0..1 vento                    weather.cloud 0..1 nuvens
 *    weather.night       0..1 (0 = dia claro, 1 = noite fechada)  weather.isNight
 *    weather.drySpell    dias seguidos sem chuva (seca)  weather.heat 0..1 onda de calor
 *    weather.flash       0..1 clarão de relâmpago (decai sozinho)
 *    weather.sky / weather.next / weather.nextIn   previsão: 'clear'|'cloudy'|'rain'|'storm'
 *    weather.on(fn)      avisos: 'lightning' | 'dawn' | 'dusk' | 'sky' (mudou o tempo)
 *
 *  Quem escreve: só o laço do jogo (rp/index.ts → weather.step(dt)). Determinístico
 *  por semente (a previsão de um save é sempre a mesma sequência).
 * ============================================================ */

export type SkyKind = 'clear' | 'cloudy' | 'rain' | 'storm';
export type WeatherEvent = 'lightning' | 'dawn' | 'dusk' | 'sky';

export interface WeatherSave {
  day: number;
  hour: number;
  sky: SkyKind;
  next: SkyKind;
  left: number;
  dry: number;
  heat: number;
  rs: number;
  len: number;
}

/** regras por dificuldade (0 fácil … 3 muito difícil) */
const RULES = [
  // chance de chuva, de temporal, duração média de uma frente (h de jogo)
  { rain: 0.12, storm: 0, hold: 5 },
  { rain: 0.22, storm: 0.0, hold: 4 },
  { rain: 0.26, storm: 0.1, hold: 3.5 },
  { rain: 0.3, storm: 0.18, hold: 3 },
];
const RAIN_OF: Record<SkyKind, number> = { clear: 0, cloudy: 0, rain: 0.7, storm: 1 };
const CLOUD_OF: Record<SkyKind, number> = { clear: 0.05, cloudy: 0.6, rain: 0.85, storm: 1 };

export class Weather {
  day = 1;
  hour = 7;
  /** minutos reais por dia de jogo */
  dayLen = 22;
  rain = 0;
  storm = 0;
  cloud = 0.05;
  wind = 0.2;
  drySpell = 0;
  heat = 0;
  /** neblina extra (evento "banco de neblina") 0..1 */
  fog = 0;
  flash = 0;
  sky: SkyKind = 'clear';
  next: SkyKind = 'clear';
  /** horas de jogo até a próxima mudança */
  nextIn = 4;
  diff = 1;
  /** relógio parado (fácil sem ciclo, testes) */
  frozen = false;
  /** contador para o próximo relâmpago (s reais) */
  private boltT = 8;
  private rs = 1;
  private ls: ((e: WeatherEvent) => void)[] = [];
  private rainedToday = false;
  private forced: SkyKind | null = null;
  private forcedT = 0;

  reset(seed: number, diff: number): void {
    this.diff = diff;
    this.day = 1;
    this.hour = 7;
    this.rain = this.storm = 0;
    this.cloud = 0.05;
    this.sky = 'clear';
    this.rs = (seed ^ 0x9e3779b9) >>> 0 || 7;
    this.next = this.roll();
    this.nextIn = 3 + this.rand() * 3;
    this.drySpell = 0;
    this.heat = 0;
    this.fog = 0;
    this.flash = 0;
    this.forced = null;
  }

  private rand(): number {
    let s = this.rs;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.rs = s >>> 0;
    return this.rs / 4294967296;
  }
  private roll(): SkyKind {
    const R = RULES[this.diff] ?? RULES[1];
    const r = this.rand();
    // seca longa puxa chuva; chuva seguida puxa sol
    const dryBoost = Math.min(0.25, this.drySpell * 0.06);
    if (r < R.storm + dryBoost * 0.3) return 'storm';
    if (r < R.storm + R.rain + dryBoost) return 'rain';
    if (r < R.storm + R.rain + dryBoost + 0.25) return 'cloudy';
    return 'clear';
  }

  on(fn: (e: WeatherEvent) => void): () => void {
    this.ls.push(fn);
    return () => (this.ls = this.ls.filter((f) => f !== fn));
  }
  private emit(e: WeatherEvent): void {
    for (const f of this.ls) f(e);
  }

  /** 0 = dia, 1 = noite fechada (transição suave no nascer/pôr) */
  get night(): number {
    const h = this.hour;
    if (h >= 6.6 && h <= 17.6) return 0;
    if (h > 17.6 && h < 19.2) return (h - 17.6) / 1.6;
    if (h > 5 && h < 6.6) return 1 - (h - 5) / 1.6;
    return 1;
  }
  get isNight(): boolean {
    return this.hour >= 18.7 || this.hour < 5.4;
  }
  /** horário comercial (lavadora/exportação de dia) */
  get workHours(): boolean {
    return this.hour >= 6 && this.hour < 19;
  }
  /** altura do sol: -1..1 (seno do ângulo; nasce 6h, se põe 18h) */
  get sunUp(): number {
    return Math.sin(((this.hour - 6) / 12) * Math.PI);
  }

  /** força um tempo (botão de chuva do HUD, eventos) por algumas horas */
  force(k: SkyKind, hours = 2): void {
    this.forced = k;
    this.forcedT = hours;
    if (this.sky !== k) {
      this.sky = k;
      this.emit('sky');
    }
  }

  /** pula o relógio até a hora h (dormir, descanso) — avança dias */
  skipTo(h: number): number {
    let dh = h - this.hour;
    if (dh <= 0) dh += 24;
    this.advance(dh);
    this.rain = RAIN_OF[this.sky];
    this.storm = this.sky === 'storm' ? 1 : 0;
    this.cloud = CLOUD_OF[this.sky];
    return dh;
  }
  /** avança horas de jogo (sem relâmpagos no meio) */
  advance(dh: number): void {
    const was = this.hour;
    this.hour += dh;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.newDay();
    }
    this.nextIn -= dh;
    while (this.nextIn <= 0) this.change();
    if (was < 6 && this.hour >= 6) this.emit('dawn');
    if (was < 18.5 && this.hour >= 18.5) this.emit('dusk');
  }
  private newDay(): void {
    this.day++;
    if (this.rainedToday) this.drySpell = 0;
    else this.drySpell++;
    this.rainedToday = false;
    // onda de calor depois de 3 dias secos (difícil+)
    this.heat = this.diff >= 2 && this.drySpell >= 3 ? Math.min(1, (this.drySpell - 2) * 0.35) : 0;
  }
  private change(): void {
    const R = RULES[this.diff] ?? RULES[1];
    const prev = this.sky;
    if (this.forced && this.forcedT > 0) this.sky = this.forced;
    else this.sky = this.next;
    this.next = this.roll();
    // nunca temporal direto de céu limpo: passa por nublado
    if (this.next === 'storm' && this.sky === 'clear') this.next = 'cloudy';
    this.nextIn += R.hold * (0.6 + this.rand() * 0.8);
    if (prev !== this.sky) this.emit('sky');
  }

  /** passo em segundos reais */
  step(dt: number): void {
    const dh = this.frozen ? 0 : (dt * 24) / (this.dayLen * 60);
    const was = this.hour;
    if (dh) {
      this.hour += dh;
      if (this.hour >= 24) {
        this.hour -= 24;
        this.newDay();
      }
      this.nextIn -= dh;
      if (this.forcedT > 0) {
        this.forcedT -= dh;
        if (this.forcedT <= 0) this.forced = null;
      }
      if (this.nextIn <= 0) this.change();
      if (was < 6 && this.hour >= 6) this.emit('dawn');
      if (was < 18.5 && this.hour >= 18.5) this.emit('dusk');
    }
    const sky = this.forced ?? this.sky;
    const k = Math.min(1, dt * 0.08);
    this.rain += (RAIN_OF[sky] - this.rain) * k;
    this.storm += ((sky === 'storm' ? 1 : 0) - this.storm) * k;
    this.cloud += (CLOUD_OF[sky] - this.cloud) * Math.min(1, dt * 0.12);
    const wantWind = 0.2 + this.cloud * 0.25 + this.storm * 0.55;
    this.wind += (wantWind - this.wind) * Math.min(1, dt * 0.2);
    if (this.rain > 0.3) this.rainedToday = true;
    this.fog = Math.max(0, this.fog - dt * 0.004);
    // relâmpagos
    this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.storm > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 6 + this.rand() * 14 * (this.diff >= 3 ? 0.7 : 1);
        this.flash = 1;
        this.emit('lightning');
      }
    }
  }

  save(): WeatherSave {
    return { day: this.day, hour: this.hour, sky: this.forced ?? this.sky, next: this.next, left: this.nextIn, dry: this.drySpell, heat: this.heat, rs: this.rs, len: this.dayLen };
  }
  load(o: WeatherSave | undefined, seed: number, diff: number): void {
    this.reset(seed, diff);
    if (!o) return;
    this.day = o.day || 1;
    this.hour = o.hour ?? 7;
    this.sky = o.sky || 'clear';
    this.next = o.next || 'clear';
    this.nextIn = o.left ?? 3;
    this.drySpell = o.dry || 0;
    this.heat = o.heat || 0;
    this.rs = o.rs || this.rs;
    this.dayLen = o.len || 22;
    this.rain = RAIN_OF[this.sky];
    this.storm = this.sky === 'storm' ? 1 : 0;
    this.cloud = CLOUD_OF[this.sky];
  }
}

/** estado único compartilhado por todo o Garimpo */
export const weather = new Weather();
