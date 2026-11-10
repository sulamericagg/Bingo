/**
 * CAÇA BLOOP — localização SÓ em primeiro plano. Nunca enviada a lugar nenhum; nada em segundo plano.
 * Android: @capacitor/geolocation (ACCESS_FINE/COARSE_LOCATION). Web: navigator.geolocation.
 * Também calcula velocidade (trava de veículo) e rumo.
 */
import { isNative } from '../core/platform';
import { bearing, distM } from './geo';

export interface Fix {
  lat: number;
  lon: number;
  acc: number;
  /** m/s suavizado (relatado pelo GPS ou derivado entre leituras) */
  speed: number;
  /** graus, 0 = norte (null se parado e sem bússola) */
  heading: number | null;
  t: number;
}

export type LocError = 'denied' | 'unavailable' | 'timeout';

export const VEHICLE_KMH = 25;

export class Locator {
  private watchId: string | number | null = null;
  private last: Fix | null = null;
  private stopped = false;
  private emaSpeed = 0;
  constructor(
    private onFix: (f: Fix) => void,
    private onError: (e: LocError) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        let p = await Geolocation.checkPermissions();
        if (p.location !== 'granted' && p.coarseLocation !== 'granted') p = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (p.location !== 'granted' && p.coarseLocation !== 'granted') return this.onError('denied');
        if (this.stopped) return;
        this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }, (pos, err) => {
          if (err || !pos) return this.onError(String((err as { message?: string })?.message ?? '').toLowerCase().includes('denied') ? 'denied' : 'unavailable');
          this.handle(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed ?? null, pos.coords.heading ?? null, pos.timestamp || Date.now());
        });
        if (this.stopped) this.stop();
      } catch (e) {
        this.onError(String(e).toLowerCase().includes('denied') ? 'denied' : 'unavailable');
      }
      return;
    }
    if (!('geolocation' in navigator)) return this.onError('unavailable');
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handle(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed, pos.coords.heading, pos.timestamp || Date.now()),
      (err) => this.onError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 },
    );
  }

  private handle(lat: number, lon: number, acc: number, spd: number | null, hd: number | null, t: number): void {
    const prev = this.last;
    let derived = 0;
    let heading: number | null = hd !== null && !Number.isNaN(hd) ? hd : null;
    if (prev) {
      const dt = (t - prev.t) / 1000;
      const d = distM(prev.lat, prev.lon, lat, lon);
      if (dt >= 0.8 && d > Math.max(2, acc * 0.25)) derived = d / dt;
      if (heading === null && d > 3) heading = bearing(prev.lat, prev.lon, lat, lon);
      if (heading === null) heading = prev.heading;
    }
    const raw = spd !== null && spd >= 0 && !Number.isNaN(spd) ? Math.max(spd, derived * 0.8) : derived;
    this.emaSpeed = this.emaSpeed * 0.5 + raw * 0.5;
    const f: Fix = { lat, lon, acc: acc || 30, speed: this.emaSpeed, heading, t };
    this.last = f;
    this.onFix(f);
  }

  stop(): void {
    this.stopped = true;
    const id = this.watchId;
    this.watchId = null;
    if (id === null) return;
    if (isNative) void import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.clearWatch({ id: String(id) })).catch(() => {});
    else navigator.geolocation.clearWatch(id as number);
  }
}

/**
 * Trava de veículo: acima de ~25 km/h por 2 leituras seguidas pausa as aparições;
 * libera depois de 15 s abaixo de 20 km/h.
 */
export class SpeedLock {
  locked = false;
  private over = 0;
  private underSince = 0;
  update(f: Fix): boolean {
    const kmh = f.speed * 3.6;
    if (kmh > VEHICLE_KMH) {
      this.over++;
      this.underSince = 0;
      if (this.over >= 2) this.locked = true;
    } else {
      this.over = 0;
      if (this.locked && kmh < 20) {
        if (!this.underSince) this.underSince = f.t;
        if (f.t - this.underSince > 15000) this.locked = false;
      }
    }
    return this.locked;
  }
}
