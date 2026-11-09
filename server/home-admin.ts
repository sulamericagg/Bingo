/**
 * Painel admin → "Casas & @nomes" (/api/admin/home/*).
 *   GET  /handle?h=            → { handle, id, at, profile }
 *   POST /handle/rename {id, handle}   troca o @nome do jogador (sem prazo de 30 dias)
 *   POST /handle/ban {handle}          bane o nome (ninguém pode usar) e tira do jogador
 *   GET  /home?id=             → { home, mess, party }
 *   POST /home/clear-mess {id} → limpa a sujeira (KV + festa ativa)
 */
import { requireAdmin } from './auth';
import { hub, requireId } from './friends';
import { BANNED, HANDLE_RE, myHandle, normalizeHandle, writeHandle } from './handles';
import { loadHome, loadMess, saveMess } from './home';
import { HttpError, json, readJson } from './util';

export async function handleHomeAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  await requireAdmin(req, env);
  const path = url.pathname.replace(/^\/api\/admin\/home/, '').replace(/\/+$/, '');
  const m = req.method;

  if (m === 'GET' && path === '/handle') {
    const h = normalizeHandle(url.searchParams.get('h') ?? '');
    const id = await env.DATA.get('handle:' + h);
    if (!id) return json({ error: 'not_found', message: 'Nenhum jogador com esse @nome.' }, 404);
    if (id === BANNED) return json({ handle: h, banned: true });
    const [cur, profile] = await Promise.all([myHandle(env, id), env.DATA.get('prof:' + id, 'json')]);
    return json({ handle: h, id, at: cur?.at ?? 0, profile });
  }
  if (m === 'POST' && path === '/handle/rename') {
    const b = await readJson(req);
    const id = requireId(b.id);
    const h = normalizeHandle(String(b.handle ?? ''));
    if (!HANDLE_RE.test(h)) throw new HttpError(400, 'bad_handle', '@nome inválido (3–16: a-z 0-9 _ .).');
    const owner = await env.DATA.get('handle:' + h);
    if (owner && owner !== id) throw new HttpError(409, 'taken', 'Esse @nome já está em uso ou banido.');
    const cur = await myHandle(env, id);
    await writeHandle(env, id, h, cur?.h ?? null);
    return json({ ok: true, handle: h });
  }
  if (m === 'POST' && path === '/handle/ban') {
    const b = await readJson(req);
    const h = normalizeHandle(String(b.handle ?? ''));
    if (!h) throw new HttpError(400, 'bad_handle');
    const id = await env.DATA.get('handle:' + h);
    await env.DATA.put('handle:' + h, BANNED);
    if (id && id !== BANNED) {
      await env.DATA.delete('ph:' + id); // o jogador escolhe outro nome (sem esperar 30 dias)
      await hub(env).setHandle(id, '');
    }
    return json({ ok: true, id: id === BANNED ? null : id });
  }
  if (m === 'GET' && path === '/home') {
    const id = requireId(url.searchParams.get('id'));
    const [home, mess, party] = await Promise.all([loadHome(env, id), loadMess(env, id), env.PARTY.get(env.PARTY.idFromName(id)).info()]);
    return json({ id, home, mess, party });
  }
  if (m === 'POST' && path === '/home/clear-mess') {
    const id = requireId((await readJson(req)).id);
    await env.PARTY.get(env.PARTY.idFromName(id)).clearMess(id);
    await saveMess(env, id, []);
    return json({ ok: true });
  }
  return json({ error: 'not_found', message: 'Rota não encontrada' }, 404);
}
