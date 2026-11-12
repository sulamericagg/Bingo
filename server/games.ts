/**
 * BLOOP ENGINE — API dos Jogos da Comunidade: /api/games/*  (docs/ENGINE-PLANO.md §2.4).
 *
 * STUB do W0: dono = W4. O server/index.ts já manda TODO /api/games/* para cá
 * (CORS e erros HttpError tratados lá), então o W4 preenche este arquivo sem
 * mexer no index.ts. Contratos de corpo/resposta: shared/engine.ts.
 */
import { GAME_ROUTES, type GameRoute } from '../shared/engine';
import { json } from './util';

const KNOWN = new Set<string>(GAME_ROUTES);

/** Roteia `${METHOD} ${path}`. Rotas conhecidas → 501 até o W4; resto → 404. */
export async function handleGames(req: Request, _env: Env, _ctx: ExecutionContext, url: URL): Promise<Response> {
  const route = `${req.method} ${url.pathname.replace(/\/+$/, '')}`;
  if (!KNOWN.has(route)) return json({ error: 'not_found', message: 'Rota não encontrada' }, 404);
  return notImplemented(route as GameRoute);
}

function notImplemented(route: GameRoute): Response {
  return json({ error: 'not_implemented', message: 'Em breve.', route }, 501);
}
