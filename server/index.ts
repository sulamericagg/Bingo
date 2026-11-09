/**
 * Bloop Orbit — Cloudflare Worker
 *  - /api/*   → API JSON (jogo + painel admin)
 *  - /admin   → painel admin (HTML único)
 *  - resto    → jogo web (pasta ./dist via binding ASSETS)
 */
import adminHtml from './admin.html';
import { handleAdminApi } from './admin-api';
import { getLeaderboard, submitScore } from './leaderboard';
import { challenges, claim, redeem, register, sync } from './public';
import { raceJoin } from './race';
import { champClaim, champGet, champList, champScore, champSignup } from './champ';
import { chatJoin } from './chat';
import { presenceJoin } from './presence';
import { chatReport, handleSocialAdmin, profileGet, profilePut } from './social';
import { friendsBlock, friendsGet, friendsRemove, friendsRequest, friendsRespond } from './friends';
import { handleCheck, handleClaim, handleMine, playerByHandle } from './handles';
import { homeGet, homePutDesign, homePutMess } from './home';
import { handleHomeAdmin } from './home-admin';
import { partyJoin } from './party';
import { HttpError, json } from './util';

/** Origens do app Android (Capacitor) e desenvolvimento local. */
const ALLOWED_ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost', 'ionic://localhost']);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(req: Request, url: URL): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  if (origin === url.origin || ALLOWED_ORIGINS.has(origin) || DEV_ORIGIN.test(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
    };
  }
  return {};
}

type PublicHandler = (req: Request, env: Env) => Promise<Response>;
const PUBLIC: Record<string, PublicHandler> = {
  'POST /api/player/register': register,
  'POST /api/player/sync': sync,
  'POST /api/inbox/claim': claim,
  'POST /api/redeem': redeem,
  'GET /api/challenges': challenges,
  'POST /api/score': submitScore,
  'GET /api/leaderboard': getLeaderboard,
  // social / campeonatos
  'POST /api/profile': profilePut,
  'GET /api/profile': profileGet,
  'POST /api/chat/report': chatReport,
  'GET /api/champ/list': champList,
  'GET /api/champ/get': champGet,
  'POST /api/champ/signup': champSignup,
  'POST /api/champ/score': champScore,
  'POST /api/champ/claim': champClaim,
  // casa, planeta & amigos (docs/CASA-AMIGOS.md)
  'GET /api/handle/check': handleCheck,
  'POST /api/handle/claim': handleClaim,
  'GET /api/handle/mine': handleMine,
  'GET /api/player/by-handle': playerByHandle,
  'GET /api/friends': friendsGet,
  'POST /api/friends/request': friendsRequest,
  'POST /api/friends/respond': friendsRespond,
  'POST /api/friends/remove': friendsRemove,
  'POST /api/friends/block': friendsBlock,
  'PUT /api/home/design': homePutDesign,
  'PUT /api/home/mess': homePutMess,
  // POST também (alguns proxies/webviews antigos não mandam PUT)
  'POST /api/home/design': homePutDesign,
  'POST /api/home/mess': homePutMess,
};

function withHeaders(res: Response, headers: Record<string, string>): Response {
  if (!Object.keys(headers).length) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
  console.error(e);
  return json({ error: 'server_error', message: 'Erro interno no servidor.' }, 500);
}

function adminPage(): Response {
  return new Response(adminHtml, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

export { RaceRoom } from './race';
export { PresenceRoom } from './presence';
export { ChatRoom } from './chat';
export { Championship } from './champ';
export { PartyRoom } from './party';
export { FriendsHub } from './friends';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/admin' || path === '/admin/' || path === '/admin/index.html') return adminPage();

    if (path.startsWith('/api/admin/social/')) {
      try {
        return await handleSocialAdmin(req, env, url);
      } catch (e) {
        return errorResponse(e);
      }
    }

    if (path.startsWith('/api/admin/home/')) {
      try {
        return await handleHomeAdmin(req, env, url);
      } catch (e) {
        return errorResponse(e);
      }
    }

    if (path.startsWith('/api/admin/') || path === '/api/admin') {
      try {
        return await handleAdminApi(req, env, url);
      } catch (e) {
        return errorResponse(e);
      }
    }

    if (path === '/api/race/join') {
      try {
        return await raceJoin(req, env);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // WebSockets do social: /api/presence/<jogo> e /api/chat/<sala>
    const ws = /^\/api\/(presence|chat)\/([a-z0-9-]{1,30})$/.exec(path);
    if (ws && !PUBLIC[`${req.method} ${path}`]) {
      try {
        return ws[1] === 'presence' ? await presenceJoin(req, env, ws[2]) : await chatJoin(req, env, ws[2]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Festa (WebSocket): /api/party/<hostId>
    const pm = /^\/api\/party\/([A-Za-z0-9-]{8,64})$/.exec(path);
    if (pm) {
      try {
        return await partyJoin(req, env, pm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    if (path.startsWith('/api/')) {
      const cors = corsHeaders(req, url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const h = PUBLIC[`${req.method} ${path.replace(/\/+$/, '')}`];
      const hm = req.method === 'GET' ? /^\/api\/home\/([A-Za-z0-9-]{8,64})$/.exec(path) : null;
      let res: Response;
      try {
        res = h ? await h(req, env) : hm ? await homeGet(req, env, hm[1]) : json({ error: 'not_found', message: 'Rota não encontrada' }, 404);
      } catch (e) {
        res = errorResponse(e);
      }
      return withHeaders(res, cors);
    }

    if (path.startsWith('/admin')) return new Response('Não encontrado', { status: 404 });
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
