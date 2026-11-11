/**
 * @NOMES (handles) — únicos, sem diferenciar maiúsculas, 3–16 caracteres [a-z0-9_.].
 *
 * KV:
 *   handle:<minúsculo>  → playerId   (ou '!banned' = nome banido pelo admin, ninguém pode usar)
 *   ph:<playerId>       → { h, at }  (nome atual e quando foi trocado — troca 1x a cada 30 dias)
 * O cartão do jogador no FriendsHub (s:<id>.h) guarda uma cópia para a lista de amigos.
 *
 * CORRIDA NO KV: o KV não tem "put se não existir". O claim faz checar → gravar → reler.
 * Dois pedidos para o MESMO nome no mesmo segundo, em locais (PoPs) diferentes, ainda podem
 * gravar os dois (o KV é eventualmente consistente, até ~60 s). O último a gravar fica com o
 * índice; o reler pega a maioria dos casos no mesmo PoP. Se o perdedor passar pelo reler, o
 * `ph:` dele aponta para um nome cujo índice é de outro: /api/player/by-handle sempre resolve
 * pelo índice, e o próximo GET /api/handle/check do perdedor mostra o nome como "taken".
 * Para um jogo infantil com nomes pouco disputados, o risco é aceitável (veja docs/CASA-AMIGOS.md).
 */
import { hub, friendInfos, requireId, resolveHandle, type SearchHit } from './friends';
import { searchNorm } from '../shared/handle-search';
import { buildExtra, loadExtraWords } from './moderation';
import { HANDLE_RE, handleRuleProblem, normalizeHandle } from '../shared/handle-rules';
import { json, readJson } from './util';
import { getPlayer, putPlayer } from './store';

export { HANDLE_RE, normalizeHandle } from '../shared/handle-rules';
export const HANDLE_CHANGE_MS = 30 * 86400_000;
export const BANNED = '!banned';

export type HandleReason = 'taken' | 'invalid' | 'blocked';

/** Valida formato + palavras reservadas + moderação (regras em shared/handle-rules.ts + lista extra do KV). null = ok. */
export async function handleProblem(env: Env, h: string): Promise<'invalid' | 'blocked' | null> {
  return handleRuleProblem(h, buildExtra(await loadExtraWords(env)));
}

export async function getHandleOwner(env: Env, h: string): Promise<string | null> {
  const v = await env.DATA.get('handle:' + h);
  return v && v !== BANNED ? v : null;
}

const CUTE = ['star', 'fun', 'pop', 'joy', 'sol', 'gg', 'bee', 'kid', 'zen', 'max', 'top', 'wow'];

/** Até 4 sugestões livres e válidas parecidas com o nome pedido. */
export async function suggestions(env: Env, h: string): Promise<string[]> {
  const base = (h.replace(/[^a-z0-9_.]/g, '').replace(/^[_.]+/, '') || 'bloop').slice(0, 12);
  const rnd = () => 10 + Math.floor(Math.random() * 990);
  const cands = [
    `${base}${rnd()}`,
    `${base}_${CUTE[Math.floor(Math.random() * CUTE.length)]}`,
    `${base}${rnd()}`,
    `${base}.${CUTE[Math.floor(Math.random() * CUTE.length)]}`,
    `${base}_${rnd()}`,
    `${base}${CUTE[Math.floor(Math.random() * CUTE.length)]}`,
  ].map((c) => c.slice(0, 16).replace(/[.]+$/, ''));
  const out: string[] = [];
  for (const c of [...new Set(cands)]) {
    if (out.length >= 4) break;
    if ((await handleProblem(env, c)) !== null) continue;
    if (await env.DATA.get('handle:' + c)) continue;
    out.push(c);
  }
  return out;
}

async function check(env: Env, raw: string, me?: string): Promise<{ ok: boolean; reason?: HandleReason; suggestions?: string[] }> {
  const h = normalizeHandle(raw);
  const prob = await handleProblem(env, h);
  if (prob) return { ok: false, reason: prob, ...(prob === 'invalid' ? {} : { suggestions: await suggestions(env, 'amigo') }) };
  const owner = await env.DATA.get('handle:' + h);
  if (owner && owner !== me) return { ok: false, reason: owner === BANNED ? 'blocked' : 'taken', suggestions: await suggestions(env, h) };
  return { ok: true };
}

/** GET /api/handle/check?h=&id= → HandleCheck */
export async function handleCheck(req: Request, env: Env): Promise<Response> {
  const u = new URL(req.url).searchParams;
  return json(await check(env, u.get('h') ?? '', u.get('id') ?? undefined));
}

/** Grava o índice e o nome do jogador (usado pelo claim e pelo admin). */
export async function writeHandle(env: Env, id: string, h: string, prev: string | null): Promise<void> {
  await env.DATA.put('handle:' + h, id);
  await env.DATA.put('ph:' + id, JSON.stringify({ h, at: Date.now() }));
  if (prev && prev !== h && (await env.DATA.get('handle:' + prev)) === id) await env.DATA.delete('handle:' + prev);
  await hub(env).setHandle(id, h);
  await syncPlayerHandle(env, id, h);
}

/** Copia o @ para o registro do jogador (lista/busca do painel). Troca de @ é rara: 1 escrita extra. */
export async function syncPlayerHandle(env: Env, id: string, h: string): Promise<void> {
  const p = await getPlayer(env, id);
  if (p && (p.handle ?? '') !== h) {
    p.handle = h || undefined;
    await putPlayer(env, p);
  }
}

/** Painel: libera o @ do jogador (o nome volta a ficar livre e ele escolhe outro sem esperar 30 dias). */
export async function resetHandle(env: Env, id: string): Promise<string | null> {
  const cur = await myHandle(env, id);
  if (cur && (await env.DATA.get('handle:' + cur.h)) === id) await env.DATA.delete('handle:' + cur.h);
  await env.DATA.delete('ph:' + id);
  await hub(env).setHandle(id, '');
  await syncPlayerHandle(env, id, '');
  return cur?.h ?? null;
}

export async function myHandle(env: Env, id: string): Promise<{ h: string; at: number } | null> {
  return (await env.DATA.get<{ h: string; at: number }>('ph:' + id, 'json')) ?? null;
}

/** POST /api/handle/claim { id, handle } → HandleCheck (+ handle, until) */
export async function handleClaim(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  const h = normalizeHandle(String(b.handle ?? ''));
  const cur = await myHandle(env, id);
  if (cur?.h === h && (await env.DATA.get('handle:' + h)) === id) return json({ ok: true, handle: h });
  const c = await check(env, h, id);
  if (!c.ok) return json(c);
  if (cur && Date.now() - cur.at < HANDLE_CHANGE_MS) return json({ ok: false, reason: 'invalid', until: cur.at + HANDLE_CHANGE_MS, handle: cur.h });
  await env.DATA.put('handle:' + h, id);
  // reler: se outro jogador gravou no meio do caminho, quem ficou no índice vence
  await new Promise((r) => setTimeout(r, 50));
  if ((await env.DATA.get('handle:' + h)) !== id) return json({ ok: false, reason: 'taken', suggestions: await suggestions(env, h) });
  await writeHandle(env, id, h, cur?.h ?? null);
  return json({ ok: true, handle: h });
}

/** GET /api/handle/mine?id= → { handle, at } (para o cliente recuperar o nome em outro aparelho) */
export async function handleMine(req: Request, env: Env): Promise<Response> {
  const id = requireId(new URL(req.url).searchParams.get('id'));
  const cur = await myHandle(env, id);
  const valid = cur && (await env.DATA.get('handle:' + cur.h)) === id;
  return json(valid ? { handle: cur.h, at: cur.at } : { handle: null });
}

/** GET /api/player/by-handle?h= → FriendInfo SEM o id (o id do jogador funciona como chave dele; nunca expor a estranhos) */
export async function playerByHandle(req: Request, env: Env): Promise<Response> {
  const h = normalizeHandle(new URL(req.url).searchParams.get('h') ?? '');
  const id = HANDLE_RE.test(h) ? await resolveHandle(env, h) : null;
  if (!id) return json({ error: 'not_found', message: 'Ninguém com esse @nome.' }, 404);
  const [info] = await friendInfos(env, [id], false);
  return json({ ...info, id: '', handle: h });
}

/**
 * GET /api/handles/search?q=&id= → { items: [{ handle, name, skin, avatar?, creature?, online, rel }] } (máx. 10)
 * Prefixo + parecidos (acentos/maiúsculas normalizados). Limitado por jogador e IP (429).
 * Nunca devolve id, e esconde bloqueados, banidos e quem desligou "aparecer na busca".
 */
export async function handlesSearch(req: Request, env: Env): Promise<Response> {
  const u = new URL(req.url).searchParams;
  const id = requireId(u.get('id'));
  const q = searchNorm(u.get('q') ?? '');
  if (q.length < 2) return json({ items: [] });
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const r = await hub(env).search(id, q, ip);
  if ('rate' in r) return json({ error: 'rate_limited', message: 'Calma! Muitas buscas seguidas. Espere um pouquinho.' }, 429);
  // perfis que ainda não estão no cache do FriendsHub: completa pelo KV (uma vez por jogador)
  const missing = r.items.filter((x) => !x._prof).map((x) => x._id);
  const extra = missing.length ? await friendInfos(env, missing, false) : [];
  const byId = new Map(extra.map((f) => [f.id as string, f]));
  const items = r.items.map((x: SearchHit) => {
    const f = byId.get(x._id) as { name?: string; skin?: string; avatar?: unknown; creature?: string } | undefined;
    const p: { name?: string; skin?: string; avatar?: unknown; creature?: string } = f ?? (x.p ? JSON.parse(x.p) : {});
    return {
      handle: x.handle,
      name: p.name || 'Bloop',
      skin: p.skin || 'bloop',
      ...(p.avatar ? { avatar: p.avatar } : {}),
      ...(p.creature ? { creature: p.creature } : {}),
      online: x.online,
      rel: x.rel,
    };
  });
  return json({ items }, 200, { 'cache-control': 'no-store' });
}
