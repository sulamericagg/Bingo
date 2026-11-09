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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PASSWORD = process.env.ADMIN_PASSWORD || 'senha-de-teste-' + Math.random().toString(36).slice(2);
let BASE = process.env.BASE;
let child;
let persist;

async function startServer() {
  const port = 8790 + Math.floor(Math.random() * 100);
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

  console.log('\nRate limit');
  let last;
  for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { password: 'x' + i });
  check('login bloqueado após muitas tentativas → 429', last.status === 429, last.data);

  console.log(`\n${passed} ok, ${failed} falha(s)`);
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
