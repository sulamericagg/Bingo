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
import { friendsBlock, friendsGet, friendsInvite, friendsInviteClear, friendsPlaying, friendsRemove, friendsRequest, friendsRespond, friendsVisibility, friendsLive } from './friends';
import { squadCreate, squadInvite, squadJoin } from './squad';
import { handleCheck, handleClaim, handleMine, handlesSearch, playerByHandle } from './handles';
import { homeGet, homePutDesign, homePutMess } from './home';
import { handleHomeAdmin } from './home-admin';
import { partyJoin } from './party';
import { nightsJoin } from './nights';
import { flightInvite, flightInvites, flightJoin } from './flight';
import { mundoInvite, mundoInvites, mundoJoin } from './mundo';
import { garimpoInvite, garimpoInvites, garimpoJoin } from './garimpo';
import { cavaInvite, cavaInvites, cavaJoin } from './cava';
import { raftInvite, raftInvites, raftJoin } from './raft';
import { duelJoin } from './duel';
import { serversList, serversMatch, serversPublish, serversThumb, serversUnpublish } from './servers';
import { feedbackPost, handleFeedbackAdmin } from './feedback';
import { aiStory } from './ai';
import { HttpError, json } from './util';
import { aiPet } from './ai-pet';
import { cavaMake } from './cava-ai';
import { adminHub } from './admin-hub';
import { sessionWho } from './auth';
import { purchaseReport } from './purchases';
import { tvFilm, tvNow, tvSubmit, tvVote, tvVoted, ugcBoard, ugcBrowse, ugcEarnings, ugcFav, ugcGet, ugcLike, ugcMine, ugcPublish, ugcReport, ugcScore, ugcThumb, ugcUnpublish, ugcUse } from './ugc';
import { handleUgcAdmin } from './ugc-admin';
import { cacaTile } from './caca-tiles';
import { handleGames } from './games';

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
  // compras reportadas pelo app (não verificadas — docs/PAINEL-ADMIN.md §8)
  'POST /api/player/purchase': purchaseReport,
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
  // Programa Beta: relatórios de bug (docs/BETA-TESTERS.md)
  'POST /api/feedback': feedbackPost,
  'POST /api/ai/story': aiStory,
  'POST /api/ai/pet': aiPet,
  'GET /api/handle/check': handleCheck,
  'POST /api/handle/claim': handleClaim,
  'GET /api/handle/mine': handleMine,
  'GET /api/player/by-handle': playerByHandle,
  'GET /api/handles/search': handlesSearch,
  'GET /api/friends': friendsGet,
  'POST /api/friends/request': friendsRequest,
  'POST /api/friends/respond': friendsRespond,
  'POST /api/friends/remove': friendsRemove,
  'POST /api/friends/block': friendsBlock,
  'POST /api/friends/invite': friendsInvite,
  'POST /api/friends/playing': friendsPlaying,
  'POST /api/friends/invite/clear': friendsInviteClear,
  'POST /api/friends/visibility': friendsVisibility,
  'POST /api/friends/prefs': friendsVisibility,
  // grupo (party de até 4) — docs/PARTY.md
  'POST /api/squad/create': squadCreate,
  'POST /api/squad/invite': squadInvite,
  'PUT /api/home/design': homePutDesign,
  'PUT /api/home/mess': homePutMess,
  // POST também (alguns proxies/webviews antigos não mandam PUT)
  'POST /api/home/design': homePutDesign,
  'POST /api/home/mess': homePutMess,
  // Pouso Forçado online: convites entre amigos
  'POST /api/voo/invite': flightInvite,
  'GET /api/voo/invites': flightInvites,
  // Mundo Aberto online (servidores): convites entre amigos
  'POST /api/mundo/invite': mundoInvite,
  'GET /api/mundo/invites': mundoInvites,
  // Navegador de servidores do Mundo (oficiais, de amigos e publicados pelo Bloop Studio)
  'GET /api/servers/list': serversList,
  'POST /api/servers/match': serversMatch,
  'GET /api/servers/thumb': serversThumb,
  'POST /api/servers/publish': serversPublish,
  'POST /api/servers/unpublish': serversUnpublish,
  // Garimpo Bruto online: convites entre amigos
  'POST /api/garimpo/invite': garimpoInvite,
  'GET /api/garimpo/invites': garimpoInvites,
  // Cava & Fala online: convites entre amigos
  'POST /api/cava/invite': cavaInvite,
  'POST /api/cava/make': cavaMake,
  'GET /api/cava/invites': cavaInvites,
  // Jangada Bloop online: convites entre amigos
  'POST /api/raft/invite': raftInvite,
  'GET /api/raft/invites': raftInvites,
  // Loja de Criações do Bloop Studio + TV Bloop (docs/LOJA-TV.md)
  'POST /api/ugc/publish': ugcPublish,
  'GET /api/ugc/browse': ugcBrowse,
  'GET /api/ugc/get': ugcGet,
  'GET /api/ugc/thumb': ugcThumb,
  'POST /api/ugc/like': ugcLike,
  'POST /api/ugc/fav': ugcFav,
  'POST /api/ugc/use': ugcUse,
  'POST /api/ugc/report': ugcReport,
  'GET /api/ugc/mine': ugcMine,
  'POST /api/ugc/unpublish': ugcUnpublish,
  'GET /api/ugc/earnings': ugcEarnings,
  'POST /api/ugc/score': ugcScore,
  'GET /api/ugc/board': ugcBoard,
  'GET /api/tv/now': tvNow,
  'GET /api/tv/film': tvFilm,
  'POST /api/tv/submit': tvSubmit,
  'POST /api/tv/vote': tvVote,
  'GET /api/tv/voted': tvVoted,
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
export { SquadRoom } from './squad';
export { FlightRoom } from './flight';
export { AdminHub } from './admin-hub';

/** Resumo do corpo para o registro: sem senha, listas grandes viram "[N itens]". */
function summarizeBody(text: string): string {
  if (!text) return '';
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return text.slice(0, 200);
  }
  const walk = (x: unknown, depth: number): unknown => {
    if (Array.isArray(x)) return x.length > 8 ? `[${x.length} itens]` : x.map((y) => walk(y, depth + 1));
    if (x && typeof x === 'object') {
      if (depth > 3) return '{…}';
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x)) o[k] = /password|senha|token/i.test(k) ? '***' : walk(val, depth + 1);
      return o;
    }
    return typeof x === 'string' ? x.slice(0, 120) : x;
  };
  return JSON.stringify(walk(v, 0)).slice(0, 600);
}

/**
 * Toda rota /api/admin/*: limite de taxa por IP (AdminHub) + registro de auditoria das ações que mudam algo
 * (e de todos os logins, certos ou errados). A autenticação continua em cada handler (requireAdmin).
 */
async function adminGate(req: Request, env: Env, ctx: ExecutionContext, path: string, handler: () => Promise<Response>): Promise<Response> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const hub = adminHub(env);
  if (!(await hub.rate('adm:' + ip, 300, 60_000))) return json({ error: 'rate_limited', message: 'Muitas requisições ao painel. Espere 1 minuto.' }, 429);
  const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  const body = mutating ? await req.clone().text().catch(() => '') : '';
  let res: Response;
  try {
    res = await handler();
  } catch (e) {
    res = errorResponse(e);
  }
  const isLogin = path === '/api/admin/login';
  if (mutating && (isLogin || (res.status !== 401 && res.status < 500))) {
    let who = isLogin ? '' : sessionWho(req);
    if (isLogin) {
      try {
        who = String(JSON.parse(body).who ?? '').slice(0, 24) || 'admin';
      } catch {
        who = '?';
      }
    }
    const action = isLogin ? (res.ok ? 'login' : 'login falhou') : `${req.method} ${path.replace(/^\/api\/admin/, '')}`;
    ctx.waitUntil(
      hub.audit({ t: Date.now(), who, ip, action, detail: isLogin ? '' : summarizeBody(body), status: res.status }).catch(() => {}),
    );
  }
  return res;
}

/** Despacha /api/admin/* (cada módulo faz o requireAdmin). Erros viram JSON em adminGate. */
async function adminRoute(req: Request, env: Env, url: URL, path: string): Promise<Response> {
  if (path.startsWith('/api/admin/social/')) return handleSocialAdmin(req, env, url);
  if (path === '/api/admin/feedback' || path.startsWith('/api/admin/feedback/')) return handleFeedbackAdmin(req, env, url);
  if (path.startsWith('/api/admin/home/')) return handleHomeAdmin(req, env, url);
  if (path.startsWith('/api/admin/ugc/')) return handleUgcAdmin(req, env, url);
  return handleAdminApi(req, env, url);
}
export { NightsRoom } from './nights';
export { WorldRoom } from './mundo';
export { GarimpoRoom } from './garimpo';
export { CavaRoom } from './cava';
export { RaftRoom } from './raft';
export { DuelRoom } from './duel';
export { ServerDir } from './servers';
export { UgcHub } from './ugc-hub';
export { TvChannel } from './tv';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/api/admin' || path.startsWith('/api/admin/')) return adminGate(req, env, ctx, path, () => adminRoute(req, env, url, path));

    if (path === '/admin' || path === '/admin/' || path === '/admin/index.html') return adminPage();

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

    // tempo real de amigos (WebSocket): pedidos/convites chegam na hora
    if (path === '/api/friends/live') {
      try {
        return await friendsLive(req, env);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Grupo (WebSocket): /api/squad/<id>
    const sq = /^\/api\/squad\/([a-z0-9]{8,16})$/.exec(path);
    if (sq) {
      try {
        return await squadJoin(req, env, sq[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Mundo Aberto online (WebSocket): /api/mundo/room/<CÓDIGO>
    const mm = /^\/api\/mundo\/room\/([A-Z0-9]{6})$/.exec(path);
    if (mm) {
      try {
        return await mundoJoin(req, env, mm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Garimpo Bruto online (WebSocket): /api/garimpo/room/<CÓDIGO>
    const gm = /^\/api\/garimpo\/room\/([A-Z0-9]{5})$/.exec(path);
    if (gm) {
      try {
        return await garimpoJoin(req, env, gm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Cava & Fala online (WebSocket): /api/cava/room/<CÓDIGO>
    const cm = /^\/api\/cava\/room\/([A-Z0-9]{5})$/.exec(path);
    if (cm) {
      try {
        return await cavaJoin(req, env, cm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Jangada Bloop online (WebSocket): /api/raft/room/<CÓDIGO>
    const rm = /^\/api\/raft\/room\/([A-Z0-9]{5})$/.exec(path);
    if (rm) {
      try {
        return await raftJoin(req, env, rm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Bloop Pink em grupo (WebSocket): /api/pink/room/<CÓDIGO> — mesmo relé da Jangada, salas à parte
    const pk = /^\/api\/pink\/room\/([A-Z0-9]{5})$/.exec(path);
    if (pk) {
      try {
        return await raftJoin(req, env, pk[1], 'pink');
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Duelo (WebSocket): /api/duel/<jogo>/<CÓDIGO> — mesmo desafio para todos (src/party/duel.ts)
    const dm = /^\/api\/duel\/([a-z]{2,12})\/([A-Z0-9]{5})$/.exec(path);
    if (dm) {
      try {
        return await duelJoin(req, env, dm[1], dm[2]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Pouso Forçado online (WebSocket): /api/voo/room/<CÓDIGO>
    const vm = /^\/api\/voo\/room\/([A-Z0-9]{5})$/.exec(path);
    if (vm) {
      try {
        return await flightJoin(req, env, vm[1]);
      } catch (e) {
        return errorResponse(e);
      }
    }

    // Noites do Acampamento (WebSocket): /api/nights/<código de 6 dígitos>
    const nm = /^\/api\/nights\/(\d{6})$/.exec(path);
    if (nm) {
      try {
        return await nightsJoin(req, env, nm[1]);
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

    // Caça Bloop: tiles vetoriais do OpenStreetMap (proxy + cache) — /api/caca/tile/14/<x>/<y>
    const ct = /^\/api\/caca\/tile\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})(?:\.pbf)?$/.exec(path);
    if (ct) {
      const cors = corsHeaders(req, url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      try {
        return await cacaTile(req, env, ctx, Number(ct[1]), Number(ct[2]), Number(ct[3]), cors);
      } catch (e) {
        return withHeaders(errorResponse(e), cors);
      }
    }

    // ---- Bloop Engine: Jogos da Comunidade (/api/games/*) → server/games.ts (dono: W4; não mexa neste bloco) ----
    if (path.startsWith('/api/games/')) {
      const cors = corsHeaders(req, url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      let res: Response;
      try {
        res = await handleGames(req, env, ctx, url);
      } catch (e) {
        res = errorResponse(e);
      }
      return withHeaders(res, cors);
    }
    // ---- fim Bloop Engine ----

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
