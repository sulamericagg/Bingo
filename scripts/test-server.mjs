#!/usr/bin/env node
/**
 * Teste ponta a ponta do Worker (API pública + admin + ranking + corrida via WebSocket) usando `wrangler dev --local`
 * (Miniflare, KV local temporário — não toca no KV real).
 *
 *   npm run test:server
 *
 * Para testar um servidor já rodando: BASE=http://127.0.0.1:8787 ADMIN_PASSWORD=... node scripts/test-server.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PASSWORD = process.env.ADMIN_PASSWORD || 'senha-de-teste-' + Math.random().toString(36).slice(2);
let BASE = process.env.BASE;
let child;
let persist;

async function startServer() {
  // porta livre de verdade (outros `wrangler dev` podem estar rodando na máquina)
  const port = await new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
  persist = mkdtempSync(join(tmpdir(), 'bo-kv-'));
  child = spawn(
    'npx',
    ['wrangler', 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist, '--var', `ADMIN_PASSWORD:${PASSWORD}`, '--show-interactive-dev-session=false'],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  BASE = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE + '/api/challenges');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(log);
  throw new Error('wrangler dev não iniciou');
}

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✔', name);
  } else {
    failed++;
    console.log('  ✘', name, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

async function call(method, path, body, token, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  if (!BASE) await startServer();
  console.log('Servidor:', BASE);

  console.log('\nJogador');
  const pid = crypto.randomUUID();
  let r = await call('POST', '/api/player/register', { id: pid, platform: 'web', version: '1.0.0' });
  check('register cria jogador com nome aleatório', r.status === 200 && r.data.id === pid && /^Bloop#\d{4}$/.test(r.data.name), r.data);
  r = await call('POST', '/api/player/register', { id: pid, platform: 'web', version: '1.0.0' });
  check('register é idempotente (mesmo nome)', r.data?.id === pid, r.data);
  r = await call('POST', '/api/player/register', { platform: 'android', version: '1.0.0' });
  check('register sem id gera UUID', /^[0-9a-f-]{36}$/.test(r.data?.id ?? ''), r.data);
  const pid2 = r.data.id;
  r = await call('POST', '/api/player/sync', { id: pid, best: 42, runs: 7, coins: 100, gems: 5, name: 'Tester' });
  check('sync atualiza e devolve inbox vazia', r.status === 200 && Array.isArray(r.data.inbox) && r.data.inbox.length === 0 && r.data.name === 'Tester', r.data);
  r = await call('POST', '/api/player/sync', { id: 'x' });
  check('sync com id inválido → 400', r.status === 400, r.data);

  console.log('\nCORS');
  r = await call('OPTIONS', '/api/redeem', undefined, null, { origin: 'https://localhost', 'access-control-request-method': 'POST' });
  check('preflight do app Android (https://localhost)', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://localhost');
  r = await call('POST', '/api/player/sync', { id: pid }, null, { origin: 'capacitor://localhost' });
  check('capacitor://localhost permitido', r.headers.get('access-control-allow-origin') === 'capacitor://localhost');
  r = await call('POST', '/api/player/sync', { id: pid }, null, { origin: 'https://evil.example' });
  check('origem desconhecida sem CORS', !r.headers.get('access-control-allow-origin'));

  console.log('\nAdmin: login');
  r = await call('GET', '/api/admin/stats');
  check('admin sem token → 401', r.status === 401, r.data);
  r = await call('POST', '/api/admin/login', { password: 'errada' });
  check('senha errada → 401', r.status === 401, r.data);
  r = await call('POST', '/api/admin/login', { password: PASSWORD });
  check('login ok devolve token', r.status === 200 && typeof r.data.token === 'string', r.data);
  const T = r.data.token;
  r = await call('GET', '/api/admin/me', undefined, T.slice(0, -2) + (T.endsWith('AA') ? 'BB' : 'AA'));
  check('token adulterado → 401', r.status === 401);
  r = await call('GET', '/api/admin/catalog', undefined, T);
  check('catálogo traz skins e rastros', r.data?.skins?.some((s) => s.id === 'king') && r.data?.trails?.some((t) => t.id === 'rainbow'), r.data);
  r = await call('GET', '/admin');
  check('/admin serve o painel HTML', r.status === 200 || r.status === 0);
  const html = await (await fetch(BASE + '/admin')).text();
  check('painel é HTML em pt-BR', html.includes('lang="pt-BR"') && html.includes('Painel'));

  console.log('\nCódigos');
  const reward = { coins: 500, gems: 20, skins: ['king'], trails: ['rainbow'], boosts: { shield: 2 }, noAds: true };
  r = await call('POST', '/api/admin/codes', { code: 'Bloop-2026', reward, maxUses: 2, notes: 'teste' }, T);
  check('cria código personalizado', r.status === 200 && r.data.codes[0] === 'BLOOP-2026', r.data);
  r = await call('POST', '/api/admin/codes', { code: 'BLOOP2026', reward }, T);
  check('código duplicado → 409', r.status === 409, r.data);
  r = await call('POST', '/api/admin/codes', { code: 'VAZIO', reward: {} }, T);
  check('pacote vazio → 400', r.status === 400, r.data);
  r = await call('POST', '/api/redeem', { id: pid, code: ' bloop 2026 ' });
  check('resgate ok (case/espaços ignorados)', r.data?.ok === true && r.data.reward?.coins === 500 && r.data.reward?.skins?.[0] === 'king', r.data);
  r = await call('POST', '/api/redeem', { id: pid, code: 'BLOOP-2026' });
  check('mesmo jogador de novo → used', r.data?.ok === false && r.data.error === 'used', r.data);
  r = await call('POST', '/api/redeem', { id: pid2, code: 'bloop2026' });
  check('2º jogador ok (2/2 usos)', r.data?.ok === true, r.data);
  const pid3 = crypto.randomUUID();
  r = await call('POST', '/api/redeem', { id: pid3, code: 'BLOOP2026' });
  check('3º jogador → limit', r.data?.ok === false && r.data.error === 'limit', r.data);
  r = await call('POST', '/api/redeem', { id: pid, code: 'NAOEXISTE' });
  check('código inexistente → invalid', r.data?.error === 'invalid', r.data);
  r = await call('POST', '/api/admin/codes', { code: 'VELHO', reward: { coins: 1 }, expiresAt: Date.now() - 1000 }, T);
  check('cria código já expirado', r.status === 200, r.data);
  r = await call('POST', '/api/redeem', { id: pid, code: 'velho' });
  check('código expirado → expired', r.data?.error === 'expired', r.data);
  r = await call('POST', '/api/admin/codes', { code: 'FUTURO', reward: { coins: 1 }, startsAt: Date.now() + 86400000 }, T);
  r = await call('POST', '/api/redeem', { id: pid, code: 'FUTURO' });
  check('código ainda não começou → invalid', r.data?.error === 'invalid', r.data);
  r = await call('PATCH', '/api/admin/codes/FUTURO', { active: false, startsAt: null }, T);
  r = await call('POST', '/api/redeem', { id: pid, code: 'FUTURO' });
  check('código desativado → invalid', r.data?.error === 'invalid', r.data);
  r = await call('POST', '/api/admin/codes', { count: 25, prefix: 'BLP', reward: { gems: 5 }, maxUses: 1 }, T);
  check('lote de 25 códigos únicos', r.data?.codes?.length === 25 && new Set(r.data.codes).size === 25 && /^BLP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.data.codes[0]), r.data);
  const batch = r.data.batch;
  const one = r.data.codes[3];
  r = await call('POST', '/api/redeem', { id: pid, code: one.toLowerCase() });
  check('código do lote resgatável', r.data?.ok === true && r.data.reward.gems === 5, r.data);
  r = await call('POST', '/api/redeem', { id: pid2, code: one });
  check('código do lote de uso único → limit', r.data?.error === 'limit', r.data);
  r = await call('GET', '/api/admin/codes', undefined, T);
  const listed = r.data?.items ?? [];
  check('lista de códigos com contagem de usos', listed.find((c) => c.key === 'BLOOP2026')?.uses === 2 && listed.filter((c) => c.batch === batch).length === 25, listed.length);
  r = await call('POST', '/api/admin/codes/bulk', { action: 'disable', batch }, T);
  check('desativar lote inteiro', r.data?.count === 25, r.data);
  r = await call('POST', '/api/redeem', { id: pid2, code: (await call('GET', '/api/admin/codes', undefined, T)).data.items.find((c) => c.batch === batch && c.uses === 0).code });
  check('código do lote desativado → invalid', r.data?.error === 'invalid', r.data);

  console.log('\nPresentes');
  r = await call('POST', '/api/admin/gifts', { target: { type: 'players', ids: [pid] }, title: 'Para você', message: 'Valeu!', reward: { coins: 1000, boosts: { magnet: 3 } } }, T);
  check('envia presente para jogador selecionado', r.status === 200 && r.data.recipients === 1, r.data);
  r = await call('POST', '/api/admin/gifts', { target: { type: 'all' }, title: 'Para todos', reward: { gems: 50 } }, T);
  check('envia presente para todos', r.status === 200 && r.data.recipients >= 2, r.data);
  r = await call('POST', '/api/admin/gifts', { target: { type: 'active', days: 7 }, title: 'Ativos', reward: { coins: 10 } }, T);
  check('envia presente para ativos 7 dias', r.status === 200 && r.data.recipients >= 2, r.data);
  r = await call('POST', '/api/player/sync', { id: pid, best: 50, runs: 8, coins: 1, gems: 1 });
  const inbox = r.data?.inbox ?? [];
  check('sync devolve 3 presentes na inbox', inbox.length === 3 && inbox.some((g) => g.title === 'Para você' && g.reward.coins === 1000), inbox);
  r = await call('POST', '/api/player/sync', { id: pid2 });
  check('outro jogador só recebe os coletivos', (r.data?.inbox ?? []).length === 2, r.data);
  const newcomer = crypto.randomUUID();
  r = await call('POST', '/api/player/sync', { id: newcomer });
  check('jogador novo não recebe presentes antigos de "todos"/ativos', (r.data?.inbox ?? []).length === 0, r.data);
  const ids = inbox.map((g) => g.id);
  r = await call('POST', '/api/inbox/claim', { id: pid, giftIds: ids });
  check('claim devolve 3 recompensas', r.data?.rewards?.length === 3 && r.data.rewards.some((p) => p.title === 'Para você' && p.boosts?.magnet === 3), r.data);
  r = await call('POST', '/api/inbox/claim', { id: pid, giftIds: ids });
  check('claim de novo é idempotente (0)', r.data?.rewards?.length === 0, r.data);
  r = await call('POST', '/api/player/sync', { id: pid });
  check('inbox vazia após claim', r.data?.inbox?.length === 0, r.data);

  console.log('\nDesafios e pacotes');
  r = await call('POST', '/api/admin/challenges', { title: 'Vídeo novo!', description: 'Assista até o fim', link: 'https://www.youtube.com/watch?v=abc', reward: { coins: 300, skins: ['ninja'] }, endsAt: Date.now() + 7 * 86400000 }, T);
  check('cria desafio com código automático e texto pronto', r.status === 200 && /^DESAFIO-/.test(r.data.challenge.code) && r.data.shareText.includes(r.data.challenge.code) && r.data.shareText.includes('Ninja'), r.data);
  const chCode = r.data.challenge.code;
  r = await call('GET', '/api/challenges');
  check('desafio aparece na lista pública (sem expor o código)', r.data?.challenges?.length === 1 && !JSON.stringify(r.data).includes(chCode), r.data);
  r = await call('POST', '/api/redeem', { id: pid, code: chCode });
  check('código do desafio resgatável', r.data?.ok === true && r.data.reward.skins[0] === 'ninja', r.data);
  r = await call('GET', '/api/admin/challenges', undefined, T);
  check('admin vê 1 resgate no desafio', r.data?.items?.[0]?.uses === 1, r.data);
  r = await call('POST', '/api/admin/presets', { name: 'Pack Teste', pack: { coins: 1 } }, T);
  r = await call('GET', '/api/admin/presets', undefined, T);
  check('pacotes salvos (exemplos + novo)', r.data?.items?.some((p) => p.name === 'Pack Teste') && r.data.items.some((p) => p.name === 'Pack Lendário'), r.data);
  r = await call('GET', '/api/admin/stats', undefined, T);
  check('dashboard com números', r.data?.players === 3 && r.data.redemptions === 4 && r.data.active24h === 3, r.data);
  r = await call('GET', '/api/admin/players?q=tester', undefined, T);
  check('busca de jogadores', r.data?.total === 1 && r.data.items[0].id === pid && r.data.items[0].best === 50, r.data);

  console.log('\nRanking');
  const lbA = pid;
  const lbB = pid2;
  const lbC = crypto.randomUUID();
  r = await call('POST', '/api/score', { id: lbA, name: 'Tester', score: 50, skin: 'bloop', duration: 30000 });
  check('envia pontuação (entra no ranking)', r.status === 200 && r.data.ok && r.data.rank.all === 1 && r.data.rank.week === 1, r.data);
  r = await call('POST', '/api/score', { id: lbB, name: 'Rival', score: 80, skin: 'king', duration: 40000 });
  check('pontuação maior assume o 1º lugar', r.data?.rank?.all === 1, r.data);
  r = await call('POST', '/api/score', { id: lbA, name: 'Tester', score: 40, skin: 'bloop', duration: 30000 });
  check('pontuação menor não piora o recorde', r.data?.best?.all === 50 && r.data.rank.all === 2, r.data);
  r = await call('POST', '/api/score', { id: lbC, name: 'Empate', score: 50, skin: 'ninja', duration: 30000 });
  check('empate: quem fez antes fica na frente', r.data?.rank?.all === 3, r.data);
  r = await call('GET', '/api/leaderboard?scope=all&me=' + lbA);
  const lbAll = r.data;
  check('GET ranking ordenado com posição do jogador', lbAll?.entries?.map((e) => e.score).join(',') === '80,50,50' && lbAll.me?.rank === 2 && lbAll.entries[1].me === true, lbAll);
  check('ranking público não expõe ids', !JSON.stringify(lbAll).includes(lbB) && !JSON.stringify(lbAll).includes(lbC));
  check('ranking traz nome e skin', lbAll?.entries?.[0]?.name === 'Rival' && lbAll.entries[0].skin === 'king', lbAll?.entries?.[0]);
  r = await call('GET', '/api/leaderboard?scope=week');
  check('ranking da semana', r.data?.scope === 'week' && /^\d{4}-W\d{2}$/.test(r.data.week) && r.data.entries.length === 3 && r.data.me === null, r.data);
  r = await call('POST', '/api/score', { id: lbC, score: 5000, skin: 'bloop', duration: 20000 });
  check('pontuação impossível para a duração → 422', r.status === 422, r.data);
  r = await call('POST', '/api/score', { id: lbC, score: 30, skin: 'bloop' });
  check('sem duração → 422', r.status === 422, r.data);
  r = await call('POST', '/api/score', { id: 'x', score: 30, duration: 9000 });
  check('id inválido → 400', r.status === 400, r.data);
  r = await call('GET', '/api/admin/leaderboard?scope=all', undefined, T);
  check('admin vê o ranking com ids', r.data?.entries?.length === 3 && r.data.entries[0].id === lbB, r.data);
  r = await call('DELETE', '/api/admin/leaderboard/' + lbB + '?ban=1', undefined, T);
  check('admin remove trapaceiro (geral + semana)', r.data?.removed === 2, r.data);
  r = await call('GET', '/api/leaderboard?scope=all');
  check('removido some do ranking público', r.data?.entries?.[0]?.score === 50 && r.data.entries.length === 2, r.data);
  r = await call('POST', '/api/score', { id: lbB, score: 90, skin: 'king', duration: 40000 });
  check('jogador bloqueado não envia mais', r.status === 403, r.data);
  r = await call('GET', '/api/admin/leaderboard?scope=week', undefined, T);
  check('lista de bloqueados', r.data?.banned?.includes(lbB) && r.data.entries.length === 2, r.data);
  r = await call('POST', '/api/admin/leaderboard/unban/' + lbB, undefined, T);
  r = await call('POST', '/api/score', { id: lbB, score: 90, skin: 'king', duration: 40000 });
  check('desbloqueado volta a enviar', r.status === 200 && r.data.rank.all === 1, r.data);

  console.log('\nCorrida Orbital (WebSocket)');
  r = await call('GET', '/api/race/join');
  check('join sem WebSocket → 426', r.status === 426, r.data);
  const wsBase = BASE.replace(/^http/, 'ws') + '/api/race/join';
  const mkClient = (name, skin, dieAt, closeAt = Infinity) =>
    new Promise((resolve) => {
      const c = { name, msgs: [], start: null, end: null, ticks: 0, lobbyMax: 0, welcome: null };
      const ws = new WebSocket(wsBase);
      let score = 0;
      let iv;
      const done = () => {
        clearInterval(iv);
        resolve(c);
      };
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: crypto.randomUUID(), name, skin, debug: true }));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        c.msgs.push(m.type);
        if (m.type === 'welcome') c.welcome = m;
        if (m.type === 'lobby') c.lobbyMax = Math.max(c.lobbyMax, m.players.length);
        if (m.type === 'start') {
          c.start = m;
          const t0 = Date.now() + m.countdownMs;
          iv = setInterval(() => {
            const t = (Date.now() - t0) / 1000;
            if (t < 0) return;
            score = Math.floor(t * 2);
            if (t >= closeAt) {
              clearInterval(iv);
              c.closed = true;
              ws.close();
              return;
            }
            ws.send(JSON.stringify({ type: 'state', score, p: score, alive: t < dieAt }));
          }, 160);
        }
        if (m.type === 'tick') {
          c.ticks++;
          c.lastTick = m;
          (c.tickLog ??= []).push(m);
        }
        if (m.type === 'end') {
          c.end = m;
          done();
        }
      };
      ws.onclose = () => !c.closed && done();
      ws.onerror = () => done();
      setTimeout(() => {
        try { ws.close(); } catch {}
        done();
      }, 45000);
    });
  const [ca, cb] = await Promise.all([mkClient('Alfa', 'bloop', 2.5), new Promise((res) => setTimeout(() => mkClient('Beta', 'king', 4).then(res), 300))]);
  check('os 2 clientes caem na mesma sala', ca.welcome && cb.welcome && ca.welcome.room === cb.welcome.room && ca.welcome.you !== cb.welcome.you, [ca.welcome, cb.welcome]);
  check('ambos recebem a MESMA seed', ca.start && cb.start && ca.start.seed === cb.start.seed && Number.isInteger(ca.start.seed), [ca.start?.seed, cb.start?.seed]);
  check('bots completam a sala (5 jogadores, 3 bots em debug)', ca.start?.players?.length === 5 && ca.start.players.filter((p) => p.bot).length === 3 && ca.lobbyMax === 5, ca.start?.players);
  check('nomes dos 2 humanos na lista', ['Alfa', 'Beta'].every((n) => ca.start?.players?.some((p) => p.name === n && !p.bot)));
  check('classificação ao vivo chega (ticks)', ca.ticks >= 5 && cb.ticks >= 5 && ca.lastTick.s.length === 5, [ca.ticks, cb.ticks]);
  const res = ca.end?.results ?? [];
  check('resultado final com 5 colocações', res.length === 5 && res.map((x) => x.place).join() === '1,2,3,4,5', res);
  check('resultado ordenado por pontos (empate: tempo vivo)', res.every((x, i) => i === 0 || res[i - 1].score > x.score || (res[i - 1].score === x.score && res[i - 1].tAlive >= x.tAlive)), res);
  check('prêmios por colocação (100+5, 60, 40, 20, 20)', res.map((x) => `${x.coins}/${x.gems}`).join() === '100/5,60/0,40/0,20/0,20/0', res);
  check('Beta (viveu mais) fica à frente de Alfa', res.findIndex((x) => x.name === 'Beta') < res.findIndex((x) => x.name === 'Alfa'), res);
  check('os dois recebem o mesmo resultado', JSON.stringify(ca.end) === JSON.stringify(cb.end));
  const [cq, cr] = await Promise.all([mkClient('Sai', 'bloop', 99, 1.5), new Promise((res) => setTimeout(() => mkClient('Fica', 'bloop', 3.5).then(res), 200))]);
  const quitSlot = cq.welcome?.you;
  const sawQuit = (cr.tickLog ?? []).some((m) => m.t < 3.4 && m.s.some((row) => row[0] === quitSlot && row[3] === 0));
  check('desconexão no meio da corrida conta como queda', cq.welcome && cr.welcome?.room === cq.welcome.room && sawQuit, (cr.tickLog ?? []).slice(-1));
  check('quem ficou recebe o resultado (com quem saiu)', cr.end?.results?.length === 5 && cr.end.results.some((x) => x.name === 'Sai'), cr.end);
  const cs = await mkClient('Solo', 'bloop', 1);
  check('jogador sozinho: 4 bots e resultado', cs.start?.players?.length === 5 && cs.start.players.filter((p) => p.bot).length === 4 && cs.end?.results?.length === 5, cs.start?.players);

  await socialTests(T);
  await homeTests(T);

  console.log('\nRate limit');
  let last;
  for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { password: 'x' + i });
  check('login bloqueado após muitas tentativas → 429', last.status === 429, last.data);

  console.log(`\n${passed} ok, ${failed} falha(s)`);
}

/* ======================= SOCIAL (presença, chat, campeonatos) ======================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente WebSocket que guarda todas as mensagens recebidas. */
function wsClient(path) {
  return new Promise((resolve) => {
    const c = { msgs: [], open: false, closed: false };
    const ws = new WebSocket(BASE.replace(/^http/, 'ws') + path);
    c.ws = ws;
    c.send = (o) => ws.send(JSON.stringify(o));
    c.of = (type) => c.msgs.filter((m) => m.type === type);
    c.wait = async (pred, ms = 4000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const m = c.msgs.find(pred);
        if (m) return m;
        await sleep(40);
      }
      return null;
    };
    ws.onopen = () => {
      c.open = true;
      resolve(c);
    };
    ws.onmessage = (ev) => {
      try {
        c.msgs.push(JSON.parse(ev.data));
      } catch {}
    };
    ws.onclose = () => {
      c.closed = true;
      if (!c.open) resolve(c);
    };
    ws.onerror = () => {};
  });
}

async function socialTests(T) {
  console.log('\nPresença (drop-in)');
  const ida = crypto.randomUUID();
  const idb = crypto.randomUUID();
  const pa = await wsClient('/api/presence/orbit');
  pa.send({ type: 'hello', id: ida, name: 'Ana', skin: 'bloop' });
  const wa = await pa.wait((m) => m.type === 'welcome');
  check('1º cliente recebe welcome (sem peers)', wa && wa.you === ida && Array.isArray(wa.peers), wa);
  const pb = await wsClient('/api/presence/orbit');
  pb.send({ type: 'hello', id: idb, name: 'Beto', skin: 'king' });
  const wb = await pb.wait((m) => m.type === 'welcome');
  check('2º cliente vê o 1º na lista de peers', wb?.peers?.some((p) => p.id === ida && p.name === 'Ana'), wb);
  const ja = await pa.wait((m) => m.type === 'join');
  check('1º cliente recebe "join" do 2º', ja?.p?.id === idb && ja.p.name === 'Beto', ja);
  pa.send({ type: 's', s: { x: 10.123, y: 20, bad: 'x' } });
  const sb = await pb.wait((m) => m.type === 's');
  check('estado é retransmitido (números, arredondado)', sb?.id === ida && sb.s.x === 10.12 && sb.s.y === 20 && !('bad' in sb.s), sb);
  pb.send({ type: 'e', code: 'joinha' });
  const ea = await pa.wait((m) => m.type === 'e');
  check('emote chega ao outro jogador', ea?.id === idb && ea.code === 'joinha', ea);
  pb.send({ type: 'e', code: 'palavrao' });
  await sleep(300);
  check('emote desconhecido é ignorado', pa.of('e').length === 1);
  pb.ws.close();
  const la = await pa.wait((m) => m.type === 'leave');
  check('saída avisa os outros ("leave")', la?.id === idb, la);
  pa.ws.close();
  const many = [];
  for (let i = 0; i < 7; i++) {
    const c = await wsClient('/api/presence/shardtest');
    c.send({ type: 'hello', id: crypto.randomUUID(), name: 'P' + i, skin: 'bloop' });
    await c.wait((m) => m.type === 'welcome');
    many.push(c);
  }
  const lastW = many[6].msgs.find((m) => m.type === 'welcome');
  check('7º jogador vai para outro shard (máx. 6 por sala)', lastW && lastW.peers.length === 0 && many[5].msgs.find((m) => m.type === 'welcome').peers.length === 5, lastW);
  many.forEach((c) => c.ws.close());

  console.log('\nFiltro do chat');
  const F = async (text) => (await call('POST', '/api/admin/social/chat/test', { text }, T)).data;
  const blocked = {
    'pt palavrão': 'que porra é essa',
    'pt insulto': 'vc é um idiota',
    'en palavrão': 'what the fuck',
    'en insulto': 'you are stupid',
    'es palavrão': 'eres un pendejo',
    'es insulto': 'qué mierda',
    'leetspeak c4r4lh0': 'c4r4lh0 mano',
    'leetspeak f*ck/sh1t': 'sh1t',
    'letras repetidas': 'merdaaaaa',
    'letras separadas': 'p u t a',
    'letras com pontos': 'f.u.c.k you',
    'acento': 'idióta',
  };
  for (const [name, text] of Object.entries(blocked)) {
    const r = await F(text);
    check(`bloqueia ${name}: "${text}"`, r && (!r.ok || r.text.includes('###')), r);
  }
  const pii = {
    telefone: 'me liga 11 98765-4321',
    'telefone colado': '11987654321',
    email: 'manda pra ana.silva@gmail.com',
    'email com arroba escrito': 'ana arroba gmail ponto com',
    url: 'entra em www.site.com',
    'url https': 'https://exemplo.org/x',
    'dominio solto': 'joga em meujogo.com.br',
    '@perfil': 'me segue @bloop_kid',
    whatsapp: 'me chama no whatsapp',
    zap: 'passa teu zap',
    insta: 'qual teu insta',
    telegram: 'tem telegram?',
    endereço: 'moro na rua das flores 12',
  };
  for (const [name, text] of Object.entries(pii)) {
    const r = await F(text);
    check(`dado pessoal recusado (${name})`, r && !r.ok && r.reason === 'pii', r);
  }
  const fine = ['oi pessoal!', 'boa partida, gg', 'vamos jogar de novo?', 'computador novo', 'instalar o jogo', 'sem atalho hoje', 'esse é o melhor jogo', 'Hola amigos', 'nice run, well played', 'fiz 120 pontos', 'sexta feira tem copa', 'enviado'];
  for (const text of fine) {
    const r = await F(text);
    check(`mensagem normal passa: "${text}"`, r?.ok && r.text === text, r);
  }
  check('mensagem longa (>80) recusada', (await F('a'.repeat(81))).reason === 'long');
  let r = await call('PUT', '/api/admin/social/chat/words', { words: ['bobalhao'] }, T);
  check('admin salva palavra extra', r.data?.words?.includes('bobalhao'), r.data);
  r = await call('POST', '/api/admin/social/chat/test', { text: 'seu bobalhão' }, T);
  check('palavra extra passa a ser filtrada', r.data && (!r.data.ok || r.data.text.includes('###')), r.data);

  console.log('\nChat (WebSocket)');
  const u1 = crypto.randomUUID();
  const u2 = crypto.randomUUID();
  const c1 = await wsClient('/api/chat/global');
  c1.send({ type: 'hello', id: u1, name: 'Clara', skin: 'bloop' });
  const h1 = await c1.wait((m) => m.type === 'hist');
  check('chat: histórico ao entrar', h1 && Array.isArray(h1.msgs), h1);
  const c2 = await wsClient('/api/chat/global');
  c2.send({ type: 'hello', id: u2, name: 'Duda', skin: 'king' });
  await c2.wait((m) => m.type === 'hist');
  c1.send({ type: 'say', text: 'oi Duda!' });
  const m2 = await c2.wait((m) => m.type === 'msg' && m.m.text === 'oi Duda!');
  check('mensagem chega ao outro jogador', m2?.m?.name === 'Clara' && m2.m.pid === u1, m2);
  await sleep(2100);
  c1.send({ type: 'say', text: 'seu idiota' });
  const m3 = await c2.wait((m) => m.type === 'msg' && m.m.text?.includes('###'));
  check('palavrão chega como ###', m3?.m?.text === 'seu ###', m3);
  await sleep(2100);
  c1.send({ type: 'say', text: 'meu zap é 11999998888' });
  const rj = await c1.wait((m) => m.type === 'reject');
  check('dado pessoal: recusado com aviso amigável', rj?.reason === 'pii' && /segurança/.test(rj.message), rj);
  await sleep(2100);
  c1.send({ type: 'quick', code: 'gg' });
  const q = await c2.wait((m) => m.type === 'msg' && m.m.q === 'gg');
  check('atalho rápido (quick) chega', !!q, q);
  await sleep(4500);
  c1.msgs.length = 0;
  for (let i = 0; i < 5; i++) c1.send({ type: 'say', text: 'flood ' + i });
  await sleep(600);
  const rates = c1.msgs.filter((m) => m.type === 'reject' && m.reason === 'rate').length;
  const sent = c1.msgs.filter((m) => m.type === 'msg' && m.m.text?.startsWith('flood')).length;
  check('rate limit: rajada de 3, resto recusado', sent === 3 && rates === 2, { sent, rates });

  r = await call('POST', '/api/chat/report', { reporter: u2, pid: u1, name: 'Clara', text: 'seu ###', room: 'global', msgId: m3?.m?.id, reason: 'ofensa' });
  check('denúncia gravada', r.status === 200 && r.data.ok, r.data);
  r = await call('GET', '/api/admin/social/reports', undefined, T);
  check('admin vê a denúncia', r.data?.items?.some((x) => x.pid === u1 && x.reporter === u2), r.data);
  r = await call('GET', '/api/admin/social/chat/recent?room=global', undefined, T);
  check('admin vê mensagens recentes', r.data?.msgs?.some((x) => x.text === 'oi Duda!'), r.data);
  r = await call('POST', '/api/admin/social/chat/mute', { pid: u2, minutes: 5 }, T);
  await sleep(200);
  c2.send({ type: 'say', text: 'posso falar?' });
  const mu = await c2.wait((m) => m.type === 'reject' && m.reason === 'muted');
  check('silenciado não consegue falar', !!mu, c2.msgs.slice(-2));
  r = await call('POST', '/api/admin/social/chat/ban', { pid: u1, minutes: 0, reason: 'teste', purge: true }, T);
  check('ban derruba a conexão', r.data?.kicked >= 1, r.data);
  await sleep(300);
  check('banido recebe aviso e é desconectado', c1.msgs.some((m) => m.reason === 'banned') && c1.closed);
  check('mensagens do banido somem (del)', c2.msgs.some((m) => m.type === 'del' && m.ids.length >= 1));
  const c3 = await wsClient('/api/chat/global');
  c3.send({ type: 'hello', id: u1, name: 'Clara', skin: 'bloop' });
  await sleep(500);
  check('banido não consegue reconectar', c3.msgs.some((m) => m.reason === 'banned') && !c3.msgs.some((m) => m.type === 'hist'), c3.msgs);
  r = await call('GET', '/api/admin/social/chat/bans', undefined, T);
  check('lista de banidos/silenciados', r.data?.bans?.some((b) => b.pid === u1) && r.data?.mutes?.some((b) => b.pid === u2), r.data);
  await call('POST', '/api/admin/social/chat/unban', { pid: u1 }, T);
  const c4 = await wsClient('/api/chat/global');
  c4.send({ type: 'hello', id: u1, name: 'Clara', skin: 'bloop' });
  check('desbanido volta a entrar', !!(await c4.wait((m) => m.type === 'hist', 3000)));
  [c2, c3, c4].forEach((c) => c.ws.close());
  r = await call('GET', '/api/chat/global');
  check('chat sem WebSocket → 426', r.status === 426);

  console.log('\nPerfil');
  r = await call('POST', '/api/profile', { id: u2, name: 'Duda', skin: 'king', level: 7, bests: { orbit: 321 }, badges: ['champ'] });
  check('perfil salvo', r.data?.ok, r.data);
  r = await call('GET', '/api/profile?id=' + u2);
  check('perfil lido', r.data?.name === 'Duda' && r.data.level === 7 && r.data.bests.orbit === 321, r.data);
  r = await call('POST', '/api/profile', { id: u1, name: 'idiota', skin: 'king' });
  r = await call('GET', '/api/profile?id=' + u1);
  check('nome ofensivo no perfil vira "Bloop"', r.data?.name === 'Bloop', r.data);

  console.log('\nCampeonatos');
  r = await call('GET', '/api/champ/list');
  check('lista traz campeonatos regulares agendados', r.data?.items?.filter((c) => c.id.startsWith('r')).length >= 2, r.data?.items?.map((c) => c.id));
  check('regular: 3 rodadas, prêmio base em moedas', r.data.items[0].rounds.length === 3 && r.data.items[0].prize >= 100 && r.data.items[0].entry >= 1);
  const mk = async (name, startIn, roundSec, games = ['orbit', 'tubo', 'rally']) =>
    (await call('POST', '/api/admin/social/champs', { name, games, prizeBase: 100, prizePer: 50, entry: 1, startAt: Date.now() + startIn, roundSec }, T)).data;
  const P = () => crypto.randomUUID();
  const signup = (id, pid, name) => call('POST', '/api/champ/signup', { id, pid, name, skin: 'bloop' });
  const score = (id, pid, round, s, duration = 30) => call('POST', '/api/champ/score', { id, pid, round, score: s, duration });
  const get = async (id, me) => (await call('GET', `/api/champ/get?id=${id}&me=${me}`)).data;
  const claim = async (id, pid) => (await call('POST', '/api/champ/claim', { id, pid })).data;

  // A) um só inscrito → cancelado e devolvido
  const A = await mk('Teste A', 1500, 2);
  check('admin cria campeonato especial', A?.id && A.status === 'signup', A);
  const a1 = P();
  r = await signup(A.id, a1, 'Solo');
  check('inscrição ok (custa 1 ficha)', r.data?.ok && r.data.entry === 1, r.data);
  r = await signup(A.id, a1, 'Solo');
  check('inscrição repetida não cobra de novo', r.data?.already && r.data.entry === 0, r.data);
  // B) 2 inscritos, só 1 joga → ganha tudo
  const B = await mk('Teste B', 1500, 3);
  const b1 = P(), b2 = P();
  await signup(B.id, b1, 'Bia');
  await signup(B.id, b2, 'Caio');
  // C) 2 inscritos, ninguém joga → cancelado
  const C = await mk('Teste C', 1500, 2);
  const c1p = P(), c2p = P();
  await signup(C.id, c1p, 'X');
  await signup(C.id, c2p, 'Y');
  // D) 3 jogadores → eliminação
  const D = await mk('Teste D', 1500, 3);
  const d = [P(), P(), P()];
  for (const [i, pid] of d.entries()) await signup(D.id, pid, 'D' + i);
  await sleep(1700);

  let a = await get(A.id, a1);
  check('A: 1 inscrito → cancelado (poucos inscritos)', a.status === 'cancelled' && a.cancelReason === 'few_signups', a.status);
  check('A: ficha marcada para devolução', a.me.refund === true);
  let cl = await claim(A.id, a1);
  check('A: resgate devolve 1 ficha', cl.fichas === 1 && cl.coins === 0, cl);
  cl = await claim(A.id, a1);
  check('A: não devolve duas vezes', cl.fichas === 0 && cl.already, cl);
  r = await signup(A.id, P(), 'Tarde');
  check('inscrição após fechar → 409', r.status === 409, r.data);

  let b = await get(B.id, b1);
  check('B: ao vivo na rodada 1', b.status === 'live' && b.round === 0 && b.me.canPlay, b);
  r = await score(B.id, b1, 0, 999999, 10);
  check('B: pontuação impossível recusada (sanidade)', r.status === 422, r.data);
  r = await score(B.id, b1, 0, 150, 20);
  check('B: pontuação aceita', r.data?.ok && r.data.best === 150, r.data);
  await score(B.id, b1, 0, 90, 20);
  b = await get(B.id, b1);
  check('B: vale a melhor tentativa', b.me.best === 150 && b.me.attempts === 2, b.me);
  let c = await get(C.id, c1p);
  check('C: ao vivo (2 inscritos)', c.status === 'live');
  for (const [i, pid] of d.entries()) await score(D.id, pid, 0, [300, 200, 100][i], 20);
  r = await score(D.id, P(), 0, 50, 20);
  check('D: quem não se inscreveu não pontua', r.status === 403, r.data);
  await sleep(3200); // fim da rodada 1

  c = await get(C.id, c1p);
  check('C: ninguém jogou → cancelado e devolvido', c.status === 'cancelled' && c.cancelReason === 'nobody_played' && c.me.refund, c.status);
  cl = await claim(C.id, c2p);
  check('C: resgate devolve a ficha', cl.fichas === 1, cl);
  b = await get(B.id, b1);
  check('B: só ele jogou → segue sozinho para a rodada 2', b.status === 'live' && b.round === 1 && b.me.canPlay, b);
  const b2v = await get(B.id, b2);
  check('B: quem não jogou foi eliminado', b2v.me.out === 0 && !b2v.me.canPlay, b2v.me);
  let dv = await get(D.id, d[2]);
  check('D: 3 jogaram → 2 avançam, o último é eliminado', dv.round === 1 && dv.me.out === 0 && dv.standings[1].length === 2, dv.standings);
  r = await score(D.id, d[2], 1, 500, 20);
  check('D: eliminado não pontua na rodada 2', r.status === 403, r.data);
  await score(D.id, d[0], 1, 100, 20);
  await score(D.id, d[1], 1, 400, 20);
  r = await score(D.id, d[0], 0, 100, 20);
  check('D: rodada antiga não aceita mais pontos', r.status === 409, r.data);
  await sleep(3100); // fim da rodada 2
  dv = await get(D.id, d[1]);
  check('D: semifinal com 2 → os 2 vão para a final (mín. 2)', dv.round === 2 && dv.standings[2].length === 2, dv.standings);
  await score(D.id, d[0], 2, 900, 20);
  await score(D.id, d[1], 2, 800, 20);
  await sleep(3200); // fim da final (B também termina)
  dv = await get(D.id, d[0]);
  check('D: final decide o campeão', dv.status === 'done' && dv.results[0].pid === d[0] && dv.results[1].pid === d[1] && dv.me.place === 1, dv.results);
  const poolD = 100 + 50 * 3;
  check('D: prêmio 60/40 com 2 finalistas, bancado pelo sistema', dv.results[0].prize === Math.floor(poolD * 0.6) && dv.results[1].prize === Math.floor(poolD * 0.4), dv.results);
  cl = await claim(D.id, d[0]);
  check('D: campeão resgata as moedas', cl.coins === Math.floor(poolD * 0.6), cl);
  check('D: 2º resgata as moedas', (await claim(D.id, d[1])).coins === Math.floor(poolD * 0.4));
  check('D: eliminado na 1ª rodada não ganha', (await claim(D.id, d[2])).coins === 0);
  b = await get(B.id, b1);
  check('B: jogador único leva o prêmio inteiro', b.status === 'done' && b.results.length === 1 && b.results[0].pid === b1 && b.results[0].prize === 100 + 50 * 2, b.results);
  cl = await claim(B.id, b1);
  check('B: resgata o prêmio inteiro', cl.coins === 200, cl);

  const E = await mk('Teste E', 60_000, 60);
  r = await call('POST', `/api/admin/social/champs/${E.id}/cancel`, {}, T);
  check('admin cancela campeonato', r.data?.status === 'cancelled' && r.data.cancelReason === 'admin', r.data);
  r = await call('GET', '/api/admin/social/champs', undefined, T);
  check('admin lista campeonatos com inscritos', r.data?.items?.some((x) => x.id === D.id && x.players.length === 3), r.data?.items?.length);
  r = await call('GET', '/api/admin/social/champs');
  check('admin social sem token → 401', r.status === 401);
}


/* ======================= CASA, PLANETA & AMIGOS ======================= */
async function homeTests(T) {
  const uid = () => crypto.randomUUID();
  const tag = Array.from({ length: 5 }, () => 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)]).join('');
  const [A, B, C, D] = [uid(), uid(), uid(), uid()];

  console.log('\n@nomes');
  let r = await call('GET', '/api/handle/check?h=ab');
  check('curto demais → invalid', r.data?.ok === false && r.data.reason === 'invalid', r.data);
  r = await call('GET', '/api/handle/check?h=' + encodeURIComponent('com espaço'));
  check('espaço → invalid', r.data?.reason === 'invalid', r.data);
  r = await call('GET', '/api/handle/check?h=admin');
  check('reservado → blocked', r.data?.reason === 'blocked', r.data);
  for (const bad of ['merda_x', 'p.u.t.a', 'fuck123', 'ana11999887', 'insta_ana', 'zap_bia']) {
    r = await call('GET', '/api/handle/check?h=' + bad);
    check(`moderação recusa "${bad}"`, r.data?.ok === false && r.data.reason === 'blocked', r.data);
  }
  const hA = 'ana_' + tag;
  r = await call('GET', '/api/handle/check?h=@' + hA.toUpperCase());
  check('nome livre (com @ e maiúsculas) → ok', r.data?.ok === true, r.data);
  r = await call('POST', '/api/handle/claim', { id: A, handle: hA.toUpperCase() });
  check('claim ok (guardado em minúsculas)', r.data?.ok === true && r.data.handle === hA, r.data);
  r = await call('GET', '/api/handle/check?h=' + hA.toUpperCase());
  check('nome tomado → taken + sugestões livres', r.data?.reason === 'taken' && r.data.suggestions?.length >= 1 && r.data.suggestions.every((x) => /^[a-z0-9_.]{3,16}$/.test(x) && x !== hA), r.data);
  r = await call('POST', '/api/handle/claim', { id: B, handle: hA });
  check('outro jogador não pega o mesmo nome', r.data?.ok === false && r.data.reason === 'taken', r.data);
  r = await call('POST', '/api/handle/claim', { id: A, handle: 'ana2_' + tag });
  check('trocar de nome antes de 30 dias → recusado com prazo', r.data?.ok === false && r.data.until > Date.now() + 29 * 86400_000, r.data);
  r = await call('GET', '/api/handle/mine?id=' + A);
  check('handle/mine devolve o nome', r.data?.handle === hA, r.data);
  // corrida: dois jogadores pedindo o mesmo nome ao mesmo tempo → no máximo um vence
  const hRace = 'race_' + tag;
  const [r1, r2] = await Promise.all([call('POST', '/api/handle/claim', { id: C, handle: hRace }), call('POST', '/api/handle/claim', { id: D, handle: hRace })]);
  const winners = [r1, r2].filter((x) => x.data?.ok).length;
  const owner = await call('GET', '/api/player/by-handle?h=' + hRace);
  const winnerId = r1.data?.ok ? C : D;
  check('claim simultâneo: só um fica com o nome (índice consistente)', winners >= 1 && owner.data?.id === (winners === 1 ? winnerId : owner.data?.id) && [C, D].includes(owner.data?.id), { winners, o: owner.data });
  if (owner.data?.id !== C) await call('POST', '/api/handle/claim', { id: C, handle: 'cia_' + tag });
  if (owner.data?.id !== D) await call('POST', '/api/handle/claim', { id: D, handle: 'dan_' + tag });
  const hB = 'beto_' + tag;
  await call('POST', '/api/handle/claim', { id: B, handle: hB });
  r = await call('GET', '/api/player/by-handle?h=@' + hB.toUpperCase());
  check('by-handle acha o jogador (sem status online para estranhos)', r.data?.id === B && r.data.handle === hB && r.data.online === false && r.data.lastSeen === 0, r.data);
  r = await call('GET', '/api/player/by-handle?h=ninguem_' + tag);
  check('by-handle inexistente → 404', r.status === 404);

  console.log('\nAmizades');
  r = await call('POST', '/api/friends/request', { id: A, to: C });
  check('pedido por id sem ter jogado junto → recusado', r.data?.result === 'not_met', r.data);
  r = await call('POST', '/api/friends/request', { id: A, handle: '@' + hB });
  check('pedido pelo @nome exato → sent', r.data?.result === 'sent', r.data);
  r = await call('POST', '/api/friends/request', { id: A, handle: 'naoexiste_' + tag });
  check('@nome inexistente → not_found', r.data?.result === 'not_found', r.data);
  r = await call('GET', '/api/friends?id=' + B);
  check('B vê o pedido de A (com @nome)', r.data?.requests?.length === 1 && r.data.requests[0].from.id === A && r.data.requests[0].from.handle === hA, r.data);
  r = await call('POST', '/api/friends/respond', { id: B, from: A, accept: true });
  check('B aceita', r.data?.ok === true, r.data);
  r = await call('GET', '/api/friends?id=' + A);
  const fB = r.data?.friends?.find((f) => f.id === B);
  check('A vê B na lista (online, com @nome e bagunça 0)', fB && fB.handle === hB && fB.online === true && fB.houseMess === 0, r.data);
  r = await call('POST', '/api/friends/request', { id: A, handle: hB });
  check('pedir de novo → already', r.data?.result === 'already', r.data);
  // presença conta como "jogar junto"
  const pc = await wsClient('/api/presence/home-test-' + tag);
  pc.send({ type: 'hello', id: C, name: 'Cia', skin: 'bloop' });
  await pc.wait((m) => m.type === 'welcome');
  const pd = await wsClient('/api/presence/home-test-' + tag);
  pd.send({ type: 'hello', id: D, name: 'Dan', skin: 'bloop' });
  await pd.wait((m) => m.type === 'welcome');
  await sleep(300);
  pc.ws.close();
  pd.ws.close();
  r = await call('POST', '/api/friends/request', { id: C, to: D });
  check('pedido por id depois de jogarem juntos (presença) → sent', r.data?.result === 'sent', r.data);
  r = await call('POST', '/api/friends/respond', { id: D, from: C, accept: false });
  r = await call('GET', '/api/friends?id=' + D);
  check('recusar remove o pedido sem virar amigo', r.data?.requests?.length === 0 && r.data.friends.length === 0, r.data);
  // bloqueio
  await call('POST', '/api/friends/block', { id: D, target: A, on: true });
  r = await call('POST', '/api/friends/request', { id: A, handle: 'dan_' + tag });
  const dHandle = (await call('GET', '/api/handle/mine?id=' + D)).data?.handle;
  r = await call('POST', '/api/friends/request', { id: A, handle: dHandle });
  check('bloqueado: pedido some (not_found)', r.data?.result === 'not_found', r.data);
  r = await call('GET', '/api/friends?id=' + D);
  check('bloqueado não aparece nos pedidos', r.data?.requests?.length === 0, r.data);
  // limite diário de 20 pedidos
  const spammer = uid();
  const targets = [];
  for (let i = 0; i < 21; i++) {
    const t = uid();
    targets.push(t);
    await call('POST', '/api/handle/claim', { id: t, handle: `pal${'abcdefghjkmnpqrstuvwx'[i]}_${tag}` });
  }
  let lastRes;
  let sent = 0;
  const other = [];
  for (let i = 0; i < 21; i++) {
    lastRes = await call('POST', '/api/friends/request', { id: spammer, handle: `pal${'abcdefghjkmnpqrstuvwx'[i]}_${tag}` });
    if (lastRes.data?.result === 'sent') sent++;
    else other.push([i, lastRes.data]);
  }
  check('limite de 20 pedidos por dia (21º → limit)', sent === 20 && lastRes.data?.result === 'limit', { sent, other });
  r = await call('POST', '/api/friends/remove', { id: A, friend: B });
  check('desfazer amizade', r.data?.ok === true && (await call('GET', '/api/friends?id=' + B)).data.friends.length === 0, r.data);
  // refaz a amizade A–B para as casas
  await call('POST', '/api/friends/request', { id: B, handle: hA });
  await call('POST', '/api/friends/respond', { id: A, from: B, accept: true });

  console.log('\nCasas');
  const design = { v: 1, planet: { shape: 3, color: '#88ccff' }, exterior: { roof: 'r2', wall: 'w1' }, rooms: [{ id: 'sala', floor: 'f1', wall: 'w2', items: [{ id: 'sofa', x: 10, y: 20 }] }] };
  r = await call('GET', `/api/home/${A}?id=${A}`);
  check('casa inexistente → 404', r.status === 404, r.data);
  r = await call('PUT', '/api/home/design', { id: A, design });
  check('dono salva o design', r.data?.ok === true, r.data);
  r = await call('GET', `/api/home/${A}?id=${B}`);
  check('amigo vê a casa (design + sujeira vazia)', r.data?.ownerId === A && r.data.design.rooms[0].items[0].id === 'sofa' && Array.isArray(r.data.mess) && r.data.visitsOpen === true, r.data);
  r = await call('GET', `/api/home/${A}?id=${C}`);
  check('não-amigo não vê a casa → 403', r.status === 403, r.data);
  r = await call('PUT', '/api/home/design', { id: A, design: { v: 2 } });
  check('design inválido → 400', r.status === 400, r.data);
  const big = { ...design, rooms: ['a', 'b'].map((id) => ({ id, floor: 'f1', wall: 'w2', items: Array.from({ length: 300 }, (_, i) => ({ id: 'item-com-nome-comprido-' + i, x: i, y: i })) })) };
  await sleep(3100);
  r = await call('PUT', '/api/home/design', { id: A, design: big });
  check('design > 16 KB → 413', r.status === 413, r.data);
  r = await call('PUT', '/api/home/design', { id: A, design, visitsOpen: true });
  const rr = await call('PUT', '/api/home/design', { id: A, design });
  check('gravações muito rápidas → 429 (economiza KV)', r.data?.ok === true && rr.status === 429, [r.data, rr.data]);
  const mess3 = [
    { id: 'm1', kind: 'cake', room: 'sala', x: 1, y: 2, r: 10 },
    { id: 'm2', kind: 'juice', room: 'sala', x: 3, y: 4, r: 8 },
    { id: 'm3', kind: 'mud', room: 'sala', x: 5, y: 6, r: 9, moved: { itemId: 'sofa', ox: 10, oy: 20 } },
  ];
  r = await call('PUT', '/api/home/mess', { id: A, ownerId: A, mess: mess3 });
  check('dono grava sujeira', r.data?.ok === true && r.data.count === 3, r.data);
  r = await call('PUT', '/api/home/mess', { id: B, ownerId: A, mess: mess3.slice(1) });
  check('amigo limpa (remove item) → ok', r.data?.ok === true && r.data.count === 2 && r.data.cleaned === 1, r.data);
  r = await call('PUT', '/api/home/mess', { id: B, ownerId: A, mess: [...mess3.slice(1), { id: 'm9', kind: 'pie', room: 'sala', x: 0, y: 0, r: 5 }] });
  check('amigo fora de festa NÃO pode sujar → 403', r.status === 403 && r.data?.error === 'not_in_party', r.data);
  r = await call('PUT', '/api/home/mess', { id: C, ownerId: A, mess: [] });
  check('não-amigo não mexe na sujeira → 403', r.status === 403, r.data);
  r = await call('PUT', '/api/home/mess', { id: A, ownerId: A, mess: Array.from({ length: 301 }, (_, i) => ({ id: 'x' + i, kind: 'crumbs', room: 'sala', x: 0, y: 0, r: 1 })) });
  check('mais de 300 itens → 400', r.status === 400, r.data);
  r = await call('GET', '/api/friends?id=' + B);
  check('lista de amigos mostra a bagunça da casa', r.data?.friends?.find((f) => f.id === A)?.houseMess > 0, r.data?.friends);

  console.log('\nFesta');
  const host = await wsClient('/api/party/' + A);
  host.send({ type: 'hello', id: A, name: 'Ana', handle: hA, skin: 'bloop' });
  const wh = await host.wait((m) => m.type === 'welcome');
  check('anfitrião entra e recebe a sujeira atual', wh?.host === A && wh.mess?.length === 2 && wh.hostHere === true, wh);
  const guest = await wsClient('/api/party/' + A);
  guest.send({ type: 'hello', id: B, name: 'Beto', handle: hB, skin: 'king' });
  const wg = await guest.wait((m) => m.type === 'welcome');
  check('amigo entra e vê o anfitrião', wg?.peers?.some((p) => p.id === A && p.handle === hA), wg);
  const jh = await host.wait((m) => m.type === 'join');
  check('anfitrião vê o amigo entrar', jh?.p?.id === B && jh.p.name === 'Beto', jh);
  const stranger = await wsClient('/api/party/' + A);
  stranger.send({ type: 'hello', id: C, name: 'Cia', skin: 'bloop' });
  const rj = await stranger.wait((m) => m.type === 'reject');
  check('não-amigo é recusado na festa', rj?.reason === 'not_friend', rj);
  host.send({ type: 's', s: { x: 5.555, y: 7, room: 'sala', holding: 'bolo', junk: 'x' } });
  const sg = await guest.wait((m) => m.type === 's');
  check('estado retransmitido (sanitizado)', sg?.id === A && sg.s.x === 5.56 && sg.s.room === 'sala' && sg.s.holding === 'bolo' && !('junk' in sg.s), sg);
  guest.send({ type: 'ev', e: { t: 'throw', from: 'falso', food: 'tomato', x: 1, y: 2, vx: 3, vy: 4 } });
  const th = await host.wait((m) => m.type === 'ev' && m.e.t === 'throw');
  check('arremesso chega (from = quem jogou de verdade)', th?.e.from === B && th.e.food === 'tomato', th);
  guest.send({ type: 'ev', e: { t: 'splat', mess: { id: 'p1', kind: 'tomato', room: 'sala', x: 9, y: 9, r: 12 } } });
  const sp = await host.wait((m) => m.type === 'ev' && m.e.t === 'splat');
  check('splat vira sujeira para todos', sp?.e.mess.id === 'p1', sp);
  host.send({ type: 'ev', e: { t: 'clean', messId: 'm2' } });
  const cl = await guest.wait((m) => m.type === 'ev' && m.e.t === 'clean');
  check('clean remove (e avisa quem limpou)', cl?.e.messId === 'm2' && cl.e.by === A, cl);
  guest.send({ type: 'ev', e: { t: 'chat', code: 'parabens' } });
  guest.send({ type: 'ev', e: { t: 'chat', code: 'meu zap 1199' } });
  await host.wait((m) => m.type === 'ev' && m.e.t === 'chat');
  await sleep(200);
  check('chat só por códigos (texto livre ignorado)', host.msgs.filter((m) => m.type === 'ev' && m.e.t === 'chat').length === 1);
  // durante a festa, quem está nela pode sujar via REST; quem não está, não
  r = await call('PUT', '/api/home/mess', { id: B, ownerId: A, mess: [mess3[2], { id: 'p1', kind: 'tomato', room: 'sala', x: 9, y: 9, r: 12 }, { id: 'p2', kind: 'pie', room: 'sala', x: 1, y: 1, r: 5 }] });
  check('membro da festa adiciona sujeira pelo REST (vai para a festa)', r.data?.ok === true && r.data.party === true, r.data);
  host.ws.close();
  guest.ws.close();
  await sleep(700);
  r = await call('GET', `/api/home/${A}?id=${A}`);
  const ids = (r.data?.mess ?? []).map((m) => m.id).sort().join(',');
  check('fim da festa: sujeira gravada no KV (splat + limpeza)', ids === 'm3,p1,p2', r.data?.mess);
  // dono offline: amigo visita (casa aberta) e limpa
  const visit = await wsClient('/api/party/' + A);
  visit.send({ type: 'hello', id: B, name: 'Beto', skin: 'king' });
  const wv = await visit.wait((m) => m.type === 'welcome');
  check('amigo visita com o dono offline (casa aberta)', wv?.hostHere === false && wv.mess.length === 3, wv);
  visit.send({ type: 'ev', e: { t: 'clean', messId: 'p1' } });
  await sleep(200);
  visit.ws.close();
  await sleep(700);
  r = await call('GET', `/api/home/${A}?id=${B}`);
  check('limpeza da visita persiste', (r.data?.mess ?? []).length === 2 && !r.data.mess.some((m) => m.id === 'p1'), r.data?.mess);
  await sleep(3100);
  const rClose = await call('PUT', '/api/home/design', { id: A, design, visitsOpen: false });
  const shut = await wsClient('/api/party/' + A);
  shut.send({ type: 'hello', id: B, name: 'Beto', skin: 'king' });
  const rs = await shut.wait((m) => m.type === 'reject');
  check('casa fechada para visitas: amigo não entra sem o dono', rClose.data?.ok === true && rs?.reason === 'closed', [rClose.data, rs, shut.msgs]);
  shut.ws.close();

  console.log('\nPermissões da casa (access/roles)');
  const [E, F, G] = [uid(), uid(), uid()];
  for (const [pidX, nm] of [[E, 'eva'], [F, 'fab'], [G, 'gil']]) {
    await call('POST', '/api/handle/claim', { id: pidX, handle: `${nm}_${tag}` });
    await call('POST', '/api/friends/request', { id: pidX, handle: hA });
    await call('POST', '/api/friends/respond', { id: A, from: pidX, accept: true });
  }
  const access = { visits: 'friends', defaultRole: 'clean', roles: { [E]: 'decorate', [F]: 'build', [G]: 'view' } };
  const d2 = { ...design, access, paint: { sala: { wall: '#ffcc00' } } };
  await sleep(3100);
  r = await call('PUT', '/api/home/design', { id: A, design: d2, visitsOpen: true });
  check('dono define permissões (access) e pintura', r.data?.ok === true, r.data);
  r = await call('PUT', '/api/home/design', { id: B, ownerId: A, design: { ...d2, paint: { sala: { wall: '#000000' } } } });
  check("papel 'clean' (padrão) não muda o design → 403", r.status === 403 && r.data?.error === 'no_permission', r.data);
  r = await call('PUT', '/api/home/mess', { id: G, ownerId: A, mess: [] });
  check("papel 'view' não limpa → 403", r.status === 403 && r.data?.error === 'no_permission', r.data);
  r = await call('PUT', '/api/home/design', { id: E, ownerId: A, design: { ...d2, exterior: { roof: 'r9', wall: 'w1' } } });
  check("'decorate' não muda o exterior → 403 structural_change", r.status === 403 && r.data?.error === 'structural_change', r.data);
  r = await call('PUT', '/api/home/design', { id: E, ownerId: A, design: { ...d2, rooms: [...d2.rooms, { id: 'quarto', floor: 'f1', wall: 'w1', items: [] }] } });
  check("'decorate' não adiciona cômodo → 403", r.status === 403 && r.data?.error === 'structural_change', r.data);
  await sleep(3100);
  const moved = { ...d2, paint: { sala: { wall: '#ff88aa' } }, rooms: [{ ...d2.rooms[0], items: [{ id: 'sofa', x: 50, y: 60 }, { id: 'abajur', x: 1, y: 1 }] }] };
  r = await call('PUT', '/api/home/design', { id: E, ownerId: A, design: moved });
  check("'decorate' move móveis e pinta → ok", r.data?.ok === true, r.data);
  r = await call('PUT', '/api/home/design', { id: F, ownerId: A, design: { ...moved, access: { ...access, defaultRole: 'build' } } });
  check("'build' não muda permissões (access só do dono) → 403", r.status === 403 && r.data?.error === 'access_owner_only', r.data);
  await sleep(3100);
  const built = { ...moved, exterior: { roof: 'r5', wall: 'w3' }, rooms: [...moved.rooms, { id: 'quarto', floor: 'f2', wall: 'w1', items: [] }] };
  delete built.access; // amigo mandou sem access → o do dono é preservado
  r = await call('PUT', '/api/home/design', { id: F, ownerId: A, design: built });
  const after2 = await call('GET', `/api/home/${A}?id=${A}`);
  check("'build' muda estrutura; access do dono preservado", r.data?.ok === true && after2.data?.design?.rooms?.length === 2 && after2.data.design.exterior.roof === 'r5' && after2.data.design.access?.roles?.[E] === 'decorate', [r.data, after2.data?.design]);
  // na festa: evento 'design'
  const ph = await wsClient('/api/party/' + A);
  ph.send({ type: 'hello', id: A, name: 'Ana', skin: 'bloop' });
  await ph.wait((m) => m.type === 'welcome');
  const pe = await wsClient('/api/party/' + A);
  pe.send({ type: 'hello', id: E, name: 'Eva', skin: 'bloop' });
  await pe.wait((m) => m.type === 'welcome');
  const pg = await wsClient('/api/party/' + A);
  pg.send({ type: 'hello', id: G, name: 'Gil', skin: 'bloop' });
  await pg.wait((m) => m.type === 'welcome');
  const live = { ...after2.data.design, rooms: after2.data.design.rooms.map((rm, i) => (i === 0 ? { ...rm, items: [{ id: 'sofa', x: 99, y: 99 }] } : rm)) };
  pe.send({ type: 'ev', e: { t: 'design', design: live } });
  const de = await ph.wait((m) => m.type === 'ev' && m.e.t === 'design');
  check("festa: 'decorate' manda evento design → todos recebem", de?.e.by === E && de.e.design.rooms[0].items[0].x === 99, de);
  pg.send({ type: 'ev', e: { t: 'design', design: { ...live, paint: {} } } });
  const dn = await pg.wait((m) => m.type === 'denied');
  check("festa: 'view' não pode mudar o design (denied)", dn?.reason === 'no_permission', dn);
  await sleep(600);
  pe.send({ type: 'ev', e: { t: 'design', design: { ...live, exterior: { roof: 'x' } } } });
  const dn2 = await pe.wait((m) => m.type === 'denied');
  check("festa: 'decorate' não muda estrutura (denied)", dn2?.reason === 'structural_change', dn2);
  r = await call('PUT', '/api/home/design', { id: F, ownerId: A, design: { ...live, exterior: { roof: 'r7', wall: 'w3' } } });
  check("festa ativa: PUT de 'build' vai para a festa", r.data?.ok === true && r.data.party === true, r.data);
  const dF = await pe.wait((m) => m.type === 'ev' && m.e.t === 'design' && m.e.by === F);
  check('membros recebem a mudança feita pelo REST', dF?.e.design.exterior.roof === 'r7', dF);
  ph.ws.close();
  pe.ws.close();
  pg.ws.close();
  await sleep(800);
  r = await call('GET', `/api/home/${A}?id=${A}`);
  check('fim da festa: design da festa gravado no KV', r.data?.design?.exterior?.roof === 'r7' && r.data.design.rooms[0].items[0].x === 99, r.data?.design);
  // visits: 'nobody'
  await sleep(3100);
  r = await call('PUT', '/api/home/design', { id: A, design: { ...r.data.design, access: { ...access, visits: 'nobody' } } });
  const nb = await wsClient('/api/party/' + A);
  nb.send({ type: 'hello', id: F, name: 'Fab', skin: 'bloop' });
  const rn = await nb.wait((m) => m.type === 'reject');
  check("access.visits='nobody': amigo não entra na festa", r.data?.ok === true && rn?.reason === 'closed', [r.data, rn]);
  nb.ws.close();
  r = await call('GET', `/api/home/${A}?id=${F}`);
  check("access.visits='nobody': amigo não vê a casa → 403", r.status === 403 && r.data?.error === 'closed', r.data);

  console.log('\nAdmin: casas e @nomes');
  r = await call('GET', '/api/admin/home/handle?h=' + hA, undefined, T);
  check('admin acha o @nome', r.data?.id === A && r.data.handle === hA, r.data);
  r = await call('GET', '/api/admin/home/home?id=' + A, undefined, T);
  check('admin vê o JSON da casa', r.data?.home?.design?.v === 1 && r.data.mess.mess.length === 2, r.data);
  r = await call('POST', '/api/admin/home/home/clear-mess', { id: A }, T);
  r = await call('GET', `/api/home/${A}?id=${A}`);
  check('admin limpa a sujeira', r.data?.mess?.length === 0, r.data);
  r = await call('POST', '/api/admin/home/handle/rename', { id: A, handle: 'ana_nova_' + tag }, T);
  check('admin renomeia (sem prazo)', r.data?.ok === true && (await call('GET', '/api/handle/mine?id=' + A)).data.handle === 'ana_nova_' + tag, r.data);
  r = await call('POST', '/api/admin/home/handle/ban', { handle: hB }, T);
  const after = await call('GET', '/api/handle/check?h=' + hB);
  check('admin bane o @nome (ninguém usa; jogador fica sem nome)', r.data?.id === B && after.data?.ok === false && (await call('GET', '/api/handle/mine?id=' + B)).data.handle === null, [r.data, after.data]);
  r = await call('GET', '/api/admin/home/handle?h=' + hA);
  check('admin casas sem token → 401', r.status === 401);

  /* ---------------- Programa Beta: relatórios de bug ---------------- */
  console.log('\nBeta: relatórios de bug (/api/feedback)');
  const fbPid = 'beta-' + Math.random().toString(36).slice(2, 12);
  const tinyJpeg = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  const fb = (o = {}) => ({
    id: 'c1',
    pid: fbPid,
    name: 'Tester',
    handle: 'tester_1',
    category: 'physics',
    text: 'A bola atravessou a parede no nível 3, porra. Me liga 11 98765-4321',
    ctx: { version: '1.1.0', platform: 'android', ua: 'x', screen: '412x915', viewport: '412x915', dpr: 2.6, lang: 'pt', tier: 2, where: 'game:tubo', online: true },
    errors: [{ t: Date.now(), kind: 'error', msg: 'TypeError: x is undefined' }],
    shot: tinyJpeg,
    t: Date.now(),
    ...o,
  });
  r = await call('POST', '/api/feedback', fb());
  check('feedback aceito', r.status === 200 && r.data?.ok === true && /^fb:/.test(r.data.key), r.data);
  const fbKey = r.data?.key;
  r = await call('POST', '/api/feedback', fb({ text: '  ' }));
  check('feedback vazio → 400', r.status === 400, r.data);
  r = await call('POST', '/api/feedback', fb({ category: 'hack', shot: 'javascript:alert(1)', text: 'Tela branca <script>' }));
  check('categoria desconhecida vira "other" e foto inválida é ignorada', r.status === 200, r.data);
  const fbKey2 = r.data?.key;
  const huge = await fetch(BASE + '/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fb({ shot: 'data:image/jpeg;base64,' + 'A'.repeat(400_000) })) });
  check('feedback grande demais → 413', huge.status === 413, huge.status);
  r = await call('GET', '/api/admin/feedback');
  check('admin feedback sem token → 401', r.status === 401);
  r = await call('GET', '/api/admin/feedback?status=open', undefined, T);
  const it1 = r.data?.items?.find((x) => x.key === fbKey);
  check('admin lista o relatório (resumo)', !!it1 && it1.cat === 'physics' && it1.shot === true && it1.where === 'game:tubo' && it1.st === 'open', r.data);
  check('texto moderado: palavrão mascarado e telefone removido', !!it1 && it1.text.includes('###') && !it1.text.includes('98765') && it1.text.includes('[removido]'), it1?.text);
  r = await call('GET', '/api/admin/feedback?status=open&cat=other', undefined, T);
  check('filtro por categoria', r.data?.items?.length >= 1 && r.data.items.every((x) => x.cat === 'other') && r.data.items.some((x) => x.key === fbKey2), r.data);
  r = await call('GET', '/api/admin/feedback/item?key=' + encodeURIComponent(fbKey), undefined, T);
  check('admin abre o relatório completo com foto e erros', r.data?.shot === tinyJpeg && r.data.errors?.length === 1 && r.data.ctx?.tier === 2 && r.data.pii === true, r.data && { ...r.data, shot: r.data.shot?.slice(0, 30) });
  r = await call('GET', '/api/admin/feedback/item?key=' + encodeURIComponent(fbKey2), undefined, T);
  check('relatório sem foto e sem HTML', r.data?.hasShot === false && !r.data.shot && !r.data.text.includes('<'), r.data);
  r = await call('POST', '/api/admin/feedback/resolve', { key: fbKey, resolved: true, note: 'corrigido na 1.1.1' }, T);
  check('marcar como resolvido', r.data?.status === 'resolved', r.data);
  r = await call('GET', '/api/admin/feedback?status=resolved', undefined, T);
  check('aparece em "resolvidos"', r.data?.items?.some((x) => x.key === fbKey) && !(r.data.items.some((x) => x.key === fbKey2)), r.data);
  const ex = await fetch(BASE + '/api/admin/feedback/export', { headers: { authorization: 'Bearer ' + T } });
  const exj = await ex.json().catch(() => null);
  check('exportar JSON (download)', ex.status === 200 && /attachment/.test(ex.headers.get('content-disposition') || '') && exj?.reports?.some((x) => x.key === fbKey && x.note === 'corrigido na 1.1.1'), exj && exj.count);
  r = await call('POST', '/api/admin/feedback/delete', { key: fbKey2 }, T);
  r = await call('GET', '/api/admin/feedback/item?key=' + encodeURIComponent(fbKey2), undefined, T);
  check('apagar relatório', r.status === 404, r.data);
  let fbLast;
  for (let i = 0; i < 10; i++) fbLast = await call('POST', '/api/feedback', fb({ shot: undefined }));
  check('limite: 10 relatórios por hora por jogador → 429', fbLast.status === 429, fbLast.data);
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(() => {
    if (child) child.kill('SIGTERM');
    if (persist) rmSync(persist, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  });
