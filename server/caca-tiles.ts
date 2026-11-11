/**
 * CAÇA BLOOP — proxy + cache de tiles vetoriais do OpenStreetMap (mapa real da cidade).
 *
 *   GET /api/caca/tile/14/<x>/<y>  →  MVT (protobuf) com gzip, do OpenFreeMap (esquema OpenMapTiles).
 *
 * Dados: © OpenStreetMap contributors (ODbL), tiles do OpenFreeMap (https://openfreemap.org — gratuito,
 * sem chave; pede só atribuição e uso razoável). O app mostra a atribuição no canto do mapa.
 *
 * Política de uso / privacidade:
 *  - Só zoom 14 (um tile ≈ 2,4 km de lado): o servidor nunca recebe o GPS, só "qual quadradão de 2 km".
 *  - Nada é registrado: sem log de IP/tile, sem id de jogador na URL. O cache guarda o TILE, não quem pediu.
 *  - Cache em 3 camadas: Cache API do Cloudflare (quando há domínio próprio) → KV (30 dias, gzip) → origem.
 *    Cada tile sai da origem no máximo ~1 vez por mês por região do mundo, não uma vez por jogador.
 *  - Limite por IP (best-effort, por isolate) e no máximo 4 buscas simultâneas à origem por isolate.
 *  - User-Agent genérico do app (sem dados pessoais).
 */
import { json } from './util';

const ORIGIN_TILEJSON = 'https://tiles.openfreemap.org/planet';
const UA = 'BloopWorld-CacaBloop/1.0 (kids game; vector tile cache proxy)';
const Z = 14;
const KV_TTL = 30 * 24 * 3600;
const MAX_BYTES = 3 * 1024 * 1024;
const PER_IP_PER_MIN = 240;
const MAX_UPSTREAM = 4;

let tplMem: { url: string; at: number } | null = null;
let upstream = 0;
const ipHits = new Map<string, { n: number; t: number }>();

function rateOk(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.t > 60_000) {
    ipHits.set(ip, { n: 1, t: now });
    if (ipHits.size > 5000) ipHits.clear();
    return true;
  }
  e.n++;
  return e.n <= PER_IP_PER_MIN;
}

/** URL-modelo atual dos tiles (a versão do planeta muda ~1×/semana). */
async function tileTemplate(env: Env): Promise<string> {
  if (tplMem && Date.now() - tplMem.at < 6 * 3600_000) return tplMem.url;
  let url = await env.DATA.get('osm:tpl').catch(() => null);
  if (!url) {
    const r = await fetch(ORIGIN_TILEJSON, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('tilejson ' + r.status);
    const tj = (await r.json()) as { tiles?: string[] };
    url = tj.tiles?.[0] ?? '';
    if (!/^https:\/\/tiles\.openfreemap\.org\/.+\{z\}\/\{x\}\/\{y\}\.pbf$/.test(url)) throw new Error('tilejson inesperado');
    await env.DATA.put('osm:tpl', url, { expirationTtl: 24 * 3600 }).catch(() => {});
  }
  tplMem = { url, at: Date.now() };
  return url;
}

async function gzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([buf]).stream().pipeThrough(cs);
  return new Response(stream).arrayBuffer();
}

function tileResponse(gz: ArrayBuffer | null, src: string, extra: Record<string, string>): Response {
  const headers: Record<string, string> = {
    ...extra,
    'content-type': 'application/x-protobuf',
    'cache-control': 'public, max-age=604800, stale-while-revalidate=604800',
    'x-caca-src': src,
    'access-control-expose-headers': 'x-caca-src',
  };
  if (!gz || !gz.byteLength) return new Response(null, { status: 204, headers });
  headers['content-encoding'] = 'gzip';
  return new Response(gz, { headers, encodeBody: 'manual' });
}

/** Guarda o gzip "cru" na Cache API (sem content-encoding, para não ser re-codificado). */
const rawCacheRes = (gz: ArrayBuffer): Response => new Response(gz, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=2592000' } });

export async function cacaTile(req: Request, env: Env, ctx: ExecutionContext, z: number, x: number, y: number, extra: Record<string, string> = {}): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'method' }, 405, { ...extra });
  const n = 2 ** Z;
  if (z !== Z || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) return json({ error: 'bad_tile' }, 400, { ...extra });
  if (!rateOk(req.headers.get('cf-connecting-ip') ?? 'local')) return json({ error: 'rate_limited' }, 429, { ...extra, 'retry-after': '30' });

  const key = `osm:t:${Z}/${x}/${y}`;
  const cacheKey = new Request(`https://caca-tiles.cache/${Z}/${x}/${y}.pbf`);
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  // 1) cache de borda (sem efeito em *.workers.dev — por isso o KV)
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) {
    const b = await hit.arrayBuffer();
    return tileResponse(b.byteLength ? b : null, 'edge', extra);
  }
  // 2) KV (gzip)
  const kv = await env.DATA.get(key, 'arrayBuffer').catch(() => null);
  if (kv) {
    if (cache) ctx.waitUntil(cache.put(cacheKey, rawCacheRes(kv)).catch(() => {}));
    return tileResponse(kv.byteLength ? kv : null, 'kv', extra);
  }
  // 3) origem
  if (upstream >= MAX_UPSTREAM) return json({ error: 'busy' }, 503, { ...extra, 'retry-after': '2' });
  upstream++;
  let raw: ArrayBuffer;
  try {
    const tpl = await tileTemplate(env);
    const r = await fetch(tpl.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)), {
      headers: { 'user-agent': UA, accept: 'application/x-protobuf' },
    });
    if (r.status === 204 || r.status === 404) raw = new ArrayBuffer(0);
    else if (!r.ok) return json({ error: 'upstream', status: r.status }, 502, { ...extra, 'retry-after': '20' });
    else raw = await r.arrayBuffer();
  } catch {
    return json({ error: 'upstream' }, 502, { ...extra, 'retry-after': '20' });
  } finally {
    upstream--;
  }
  if (raw.byteLength > MAX_BYTES) return json({ error: 'too_large' }, 502, { ...extra });
  const gz = raw.byteLength ? await gzip(raw) : new ArrayBuffer(0);
  ctx.waitUntil(env.DATA.put(key, gz, { expirationTtl: KV_TTL }).catch(() => {}));
  if (cache) ctx.waitUntil(cache.put(cacheKey, rawCacheRes(gz.slice(0))).catch(() => {}));
  return tileResponse(gz.byteLength ? gz : null, 'origin', extra);
}
