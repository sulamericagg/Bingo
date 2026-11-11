/**
 * Compras reportadas pelo app (POST /api/player/purchase).
 *
 * ⚠️ NÃO VERIFICADAS: o app manda o que o Google Play devolveu (produto, token, nº do pedido).
 * Qualquer um pode chamar esta rota; por isso o painel mostra "reportado pelo app (não verificado)".
 * Verificação real = consultar a Google Play Developer API com uma conta de serviço (docs/PAINEL-ADMIN.md §8).
 *
 * Deduplica pelo hash do token (o app reporta de novo ao restaurar; não conta em dobro).
 */
import { CLUB, PRODUCTS } from '../src/config';
import { adminHub } from './admin-hub';
import { getPlayer, putPlayer } from './store';
import { cleanName, HttpError, json, PLAYER_ID_RE, randomPlayerName, readJson, sha256 } from './util';

const NAMES: Record<string, string> = {
  starter_pack: 'Pack Iniciante',
  remove_ads: 'Remover anúncios',
  gems_small: 'Gemas (100)',
  gems_medium: 'Gemas (220)',
  gems_large: 'Gemas (600)',
  gems_mega: 'Gemas (1.300)',
  gems_ultra: 'Gemas (2.800)',
  gems_galaxy: 'Gemas (6.000)',
  skin_phoenix: 'Skin Fênix',
  skin_lava_golem: 'Skin Golem de Lava',
  trail_neon: 'Rastro Neon',
  coin_doubler: 'Moedas em dobro',
  boost_bundle: 'Pacote de power-ups',
  vip_pack: 'Pacote VIP',
  mega_bundle: 'Mega pacote',
  flash_gems: 'Oferta relâmpago',
};

/** id → nome amigável e preço de referência (fallback da loja) */
export const PRODUCT_INFO: Record<string, { name: string; price: string; kind: 'inapp' | 'subs' }> = {
  ...Object.fromEntries(PRODUCTS.map((p) => [p.id, { name: NAMES[p.id] ?? p.id, price: p.fallbackPrice, kind: 'inapp' as const }])),
  [CLUB.productId]: { name: 'Clube Bloop', price: CLUB.fallbackPrice, kind: 'subs' },
};

const clean = (v: unknown, max: number, re = /[^\w.:\-+ ,$R]/g) => String(v ?? '').replace(re, '').slice(0, max);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function purchaseReport(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = String(b.id ?? '');
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id do jogador inválido');
  const product = clean(b.productId, 64, /[^a-z0-9_.]/gi);
  const info = PRODUCT_INFO[product];
  if (!info) throw new HttpError(400, 'bad_product', 'Produto desconhecido');
  const token = String(b.purchaseToken || b.transactionId || '').slice(0, 2000);
  if (token.length < 8) throw new HttpError(400, 'no_token', 'Falta o token da compra');
  const now = Date.now();
  const exp = Number(b.expires);
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const p = await getPlayer(env, id);
  const name = p?.name ?? (cleanName(b.name) || randomPlayerName());
  const res = await adminHub(env).reportPurchase({
    tok: hex(await sha256('purchase:' + token)).slice(0, 40),
    pid: id,
    name,
    product,
    kind: info.kind,
    source: b.source === 'restore' ? 'restore' : 'buy',
    orderId: clean(b.orderId, 64),
    price: clean(b.price, 24) || info.price,
    status: b.state === 'pending' ? 'pending' : 'purchased',
    t: now,
    ip,
    expires: info.kind === 'subs' && Number.isFinite(exp) && exp > now ? Math.min(exp, now + 400 * 86_400_000) : null,
  });
  if (res === 'rate') return json({ error: 'rate_limited', message: 'Muitas requisições' }, 429);
  if (p && (res === 'new' || info.kind === 'subs')) {
    if (res === 'new') p.purchases = (p.purchases ?? 0) + 1;
    if (info.kind === 'subs') p.clubUntil = Math.max(p.clubUntil ?? 0, Number.isFinite(exp) && exp > now ? Math.min(exp, now + 400 * 86_400_000) : now + 31 * 86_400_000);
    await putPlayer(env, p);
  }
  return json({ ok: true, status: res, verified: false });
}
