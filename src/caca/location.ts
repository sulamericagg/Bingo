/**
 * CAÇA BLOOP — localização SÓ em primeiro plano. Nunca enviada a lugar nenhum; nada em segundo plano.
 * Android: @capacitor/geolocation (ACCESS_FINE/COARSE_LOCATION). Web: navigator.geolocation.
 * As leituras passam pelo GpsFilter (gpsfilter.ts): sem "pulos" do bonequinho; velocidade e rumo suavizados.
 */
import { isNative } from '../core/platform';
import { GpsFilter, type Snapper } from './gpsfilter';

export interface Fix {
  lat: number;
  lon: number;
  acc: number;
  /** m/s suavizado (relatado pelo GPS ou derivado entre leituras) */
  speed: number;
  /** graus, 0 = norte (null se parado e sem bússola) */
  heading: number | null;
  t: number;
  /** andando de verdade (o filtro passou da trava de parado) */
  moving?: boolean;
  /** precisão ainda ruim (começo) */
  coarse?: boolean;
}

export type LocError = 'denied' | 'unavailable' | 'timeout';

export const VEHICLE_KMH = 25;

export class Locator {
  private watchId: string | number | null = null;
  private stopped = false;
  readonly filter = new GpsFilter();
  private onOri = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    let deg: number | null = null;
    if (typeof ios === 'number' && Number.isFinite(ios)) deg = ios;
    else if (e.absolute && e.alpha !== null) deg = (360 - e.alpha) % 360;
    if (deg === null) return;
    const so = (screen.orientation?.angle ?? 0) || 0;
    this.filter.setCompass((deg + so + 360) % 360);
  };
  constructor(
    private onFix: (f: Fix) => void,
    private onError: (e: LocError) => void,
    snap?: Snapper,
  ) {
    if (snap) this.filter.snap = snap;
  }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      window.addEventListener('deviceorientationabsolute' as 'deviceorientation', this.onOri);
      window.addEventListener('deviceorientation', this.onOri);
    } catch {
      /* sem bússola */
    }
    if (isNative) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        let p = await Geolocation.checkPermissions();
        if (p.location !== 'granted' && p.coarseLocation !== 'granted') p = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (p.location !== 'granted' && p.coarseLocation !== 'granted') return this.onError('denied');
        if (this.stopped) return;
        this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 1000, minimumUpdateInterval: 1000 }, (pos, err) => {
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 },
    );
  }

  private handle(lat: number, lon: number, acc: number, spd: number | null, hd: number | null, t: number): void {
    if (this.stopped || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const f = this.filter.push({ lat, lon, acc, speed: spd !== null && Number.isFinite(spd) ? spd : null, heading: hd !== null && Number.isFinite(hd) ? hd : null, t });
    if (!f) return; // leitura descartada (precisão ruim ou salto)
    this.onFix({ lat: f.lat, lon: f.lon, acc: f.acc, speed: f.speed, heading: f.heading, t: f.t, moving: f.moving, coarse: f.coarse });
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', this.onOri);
    window.removeEventListener('deviceorientation', this.onOri);
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
