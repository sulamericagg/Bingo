/**
 * Painel → Moderação da Loja e da TV (/api/admin/ugc/*). Abre para o DONO e para MODERADORES.
 * Toda ação que muda algo cai no Registro (adminGate em index.ts) com o nome de quem fez ("mod:<nome>#…").
 */
import type { UgcStatus } from '../shared/ugc';
import { requireAdmin } from './auth';
import { tvChannel } from './tv';
import { ugcHub } from './ugc-hub';
import { HttpError, json, PLAYER_ID_RE, readJson } from './util';

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

/** Coloca/tira o filme do canal conforme o novo estado. */
async function syncTv(env: Env, id: string, status: UgcStatus): Promise<void> {
  const hub = ugcHub(env);
  const tv = tvChannel(env);
  if (status !== 'approved') return void (await tv.removeFilm(id));
  const a = await hub.access(id);
  if (a && a.type === 'filme') await tv.addFilm({ id, author: a.author, aname: a.aname, title: a.title, durSec: a.meta.dur ?? 10 });
}

export async function handleUgcAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  const s = await requireAdmin(req, env, { allowMod: true });
  const path = url.pathname.replace(/^\/api\/admin\/ugc/, '') || '/';
  const sp = url.searchParams;
  const hub = ugcHub(env);
  let m: RegExpExecArray | null;

  if (req.method === 'GET' && path === '/stats') {
    const [counts, films] = await Promise.all([hub.counts(), tvChannel(env).list()]);
    return json({ counts, tv: films.length });
  }

  if (req.method === 'GET' && path === '/queue') {
    const status = ['review', 'pending', 'hidden', 'approved', 'rejected', 'all'].includes(sp.get('status') ?? '') ? sp.get('status')! : 'review';
    const type = sp.get('type') === 'filme' ? 'filme' : sp.get('type') === 'criacao' ? 'criacao' : '';
    return json({ items: await hub.queue(status, type, Number(sp.get('limit')) || 40, Number(sp.get('before')) || 0) });
  }

  if (req.method === 'GET' && (m = /^\/item\/([A-Za-z0-9_-]{1,64})$/.exec(path))) {
    const it = await hub.modItem(m[1]);
    if (!it) throw new HttpError(404, 'not_found', 'Item não encontrado');
    // conteúdo para a revisão: textos/peças (criação) ou falas + vozes (filme)
    const raw = await env.DATA.get((it.type === 'filme' ? 'ugc:f:' : 'ugc:c:') + it.id, 'json').catch(() => null);
    let content: unknown = null;
    if (it.type === 'filme' && raw) {
      const f = raw as { project: any; clips: Record<string, { mime: string; b64: string; dur: number }> };
      const lines: { t: string; who: string; audio?: string }[] = [];
      const cast = new Map<string, string>((f.project?.cast ?? []).map((c: any) => [String(c.id), String(c.name)]));
      for (const sc of f.project?.scenes ?? []) for (const sh of sc.shots ?? []) for (const l of sh.lines ?? []) lines.push({ t: String(l.text ?? ''), who: cast.get(String(l.cast)) ?? '', ...(l.audio ? { audio: String(l.audio) } : {}) });
      content = { cast: [...cast.values()], lines: lines.slice(0, 400), clips: Object.fromEntries(Object.entries(f.clips ?? {}).map(([k, c]) => [k, `data:${c.mime};base64,${c.b64}`])) };
    } else if (raw) {
      const c = raw as { name: string; kind: string; parts: { name?: string }[]; scripts?: unknown; game?: unknown; mission?: unknown };
      content = { name: c.name, kind: c.kind, parts: c.parts?.length ?? 0, partNames: [...new Set((c.parts ?? []).map((p) => p.name).filter(Boolean))].slice(0, 60), game: c.game ?? null, mission: c.mission ?? null };
    }
    return json({ item: it, content });
  }

  if (req.method === 'POST' && (m = /^\/item\/([A-Za-z0-9_-]{1,64})\/review$/.exec(path))) {
    const body = await readJson(req);
    const status = (['approved', 'rejected', 'pending', 'hidden'] as const).find((x) => x === body.status);
    if (!status) throw new HttpError(400, 'bad_status', 'Escolha aprovar ou recusar.');
    const reason = text(body.reason, 160);
    if (status === 'rejected' && !reason) throw new HttpError(400, 'no_reason', 'Diga o motivo da recusa (o autor vê).');
    const r = await hub.review(m[1], status, reason, s.who + (s.role === 'mod' ? ' (moderador)' : ''));
    if (!r) throw new HttpError(404, 'not_found', 'Item não encontrado');
    if (r.type === 'filme') await syncTv(env, m[1], status);
    return json({ ok: true, prev: r.prev });
  }

  if (req.method === 'POST' && path === '/ban') {
    const body = await readJson(req);
    const pid = String(body.pid ?? '');
    if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'Autor inválido');
    const reason = text(body.reason, 120) || 'conteúdo impróprio';
    const items = await hub.banAuthor(pid, reason, s.who);
    for (const it of items) if (it.type === 'filme') await tvChannel(env).removeFilm(it.id);
    return json({ ok: true, removed: items.length });
  }

  if (req.method === 'POST' && path === '/unban') {
    const body = await readJson(req);
    return json({ ok: await hub.unbanAuthor(String(body.pid ?? '')) });
  }

  if (req.method === 'GET' && path === '/bans') return json({ items: await hub.bans() });

  if (req.method === 'GET' && path === '/tv') return json({ films: await tvChannel(env).list(), now: await tvChannel(env).now() });

  throw new HttpError(404, 'not_found', 'Rota não encontrada');
}
