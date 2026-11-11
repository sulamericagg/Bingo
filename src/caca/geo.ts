/** CAÇA BLOOP — geohash, distâncias e projeção Web Mercator (tudo local, sem servidor). */

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat: number, lon: number, precision = 7): string {
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) (ch = (ch << 1) | 1), (lonMin = mid);
      else (ch <<= 1), (lonMax = mid);
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) (ch = (ch << 1) | 1), (latMin = mid);
      else (ch <<= 1), (latMax = mid);
    }
    even = !even;
    if (++bit === 5) {
      hash += B32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}
export function geohashBounds(hash: string): Bounds {
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;
  let even = true;
  for (const c of hash) {
    const v = B32.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const bit = (v >> b) & 1;
      if (even) {
        const mid = (lonMin + lonMax) / 2;
        if (bit) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return { latMin, latMax, lonMin, lonMax };
}

/** Células vizinhas (3×3 incluindo a central) — calculadas pelo centro deslocado. */
export function geohashNeighborhood(lat: number, lon: number, precision = 7, radius = 1): string[] {
  const b = geohashBounds(geohashEncode(lat, lon, precision));
  const dLat = b.latMax - b.latMin;
  const dLon = b.lonMax - b.lonMin;
  const cLat = (b.latMin + b.latMax) / 2;
  const cLon = (b.lonMin + b.lonMax) / 2;
  const out: string[] = [];
  for (let i = -radius; i <= radius; i++)
    for (let j = -radius; j <= radius; j++) {
      const la = Math.max(-89.999, Math.min(89.999, cLat + i * dLat));
      let lo = cLon + j * dLon;
      if (lo > 180) lo -= 360;
      if (lo < -180) lo += 360;
      out.push(geohashEncode(la, lo, precision));
    }
  return [...new Set(out)];
}

const R_EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** distância em metros (haversine) */
export function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** rumo (graus, 0 = norte) de 1 para 2 */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** desloca um ponto por (leste, norte) em metros */
export function offsetM(lat: number, lon: number, east: number, north: number): [number, number] {
  const dLat = north / R_EARTH;
  const dLon = east / (R_EARTH * Math.cos(rad(lat)));
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI];
}

/** Web Mercator: coordenadas de "pixel do mundo" no zoom z (tile 256). */
export function project(lat: number, lon: number, z: number): [number, number] {
  const s = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * s;
  const sin = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))));
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return [x, y];
}
export function unproject(x: number, y: number, z: number): [number, number] {
  const s = 256 * 2 ** z;
  const lon = (x / s) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / s;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lat, lon];
}
/** metros por pixel do mundo no zoom z e latitude lat */
export const metersPerPx = (lat: number, z: number): number => (156543.03392 * Math.cos(rad(lat))) / 2 ** z;
