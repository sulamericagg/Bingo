#!/usr/bin/env node
/**
 * Teste unitário de POST /api/ai/pet (server/ai-pet.ts) com fetch FALSO — nenhuma chamada real, nenhuma chave real.
 *   node scripts/test-ai-pet.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(process.cwd(), 'node_modules', '.aipet-'));
const out = join(dir, 'ai.mjs');
await build({ entryPoints: ['server/ai-pet.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', packages: 'external' });
const ai = await import(pathToFileURL(out).href);

function kv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => void m.set(k, v), m };
}
const req = (body, ip = '1.2.3.4') =>
  new Request('https://x/api/ai/pet', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });

let calls = [];
function fakeFetch(replyText, status = 200, stop = 'end_turn') {
  return async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    const payload =
      status === 200
        ? { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: replyText }], stop_reason: stop, stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }
        : { type: 'error', error: { type: status === 429 ? 'rate_limit_error' : 'api_error', message: 'x' } };
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
  };
}
const base = { pid: 'player-12345678', lang: 'pt', text: 'oi! quer dançar?', pet: { name: 'Bloop', food: 20, clean: 80, fun: 50, energy: 70, level: 3 } };
let pass = 0;
const ok = (name) => (pass++, console.log('  ✓', name));

// 1) sem chave → 503 no_key (app usa o bot local)
{
  const env = { DATA: kv() };
  const r = await ai.aiPet(req(base), env, { fetch: fakeFetch('{}') });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'no_key');
  ok('sem chave → no_key');
}
const env = { DATA: kv(), ANTHROPIC_API_KEY: 'sk-test-fake' };

// 2) resposta normal com emoção/ação + prompt certo
{
  calls = [];
  const r = await ai.aiPet(
    req({ ...base, history: [{ role: 'pet', text: 'Oi!' }, { role: 'user', text: 'tudo bem?' }, { role: 'pet', text: 'Tudo ótimo!' }] }),
    env,
    { fetch: fakeFetch('```json\n{"reply":"Bora dançar! Mas minha barriguinha tá roncando...","emotion":"excited","action":"dance"}\n```') },
  );
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.reply, 'Bora dançar! Mas minha barriguinha tá roncando...');
  assert.equal(j.emotion, 'excited');
  assert.equal(j.action, 'dance');
  assert.equal(j.source, 'ai');
  const b = calls[0].body;
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.match(b.system, /Brazilian Portuguese/);
  assert.match(b.system, /hungry/);
  assert.equal(b.messages[0].role, 'user'); // começa com o usuário (turno do pet inicial cai fora)
  assert.equal(b.messages.at(-1).role, 'user');
  assert.match(b.messages.at(-1).content, /quer dançar/);
  ok('resposta + emoção + ação + prompt com fome/idioma');
}

// 3) ação inválida descartada, emoção inválida → happy
{
  const r = await ai.aiPet(req(base), env, { fetch: fakeFetch('{"reply":"Oi!","emotion":"angry","action":"fly"}') });
  const j = await r.json();
  assert.equal(j.emotion, 'happy');
  assert.equal(j.action, undefined);
  ok('emoção/ação fora da lista → filtradas');
}

// 4) entrada com dado pessoal → resposta segura SEM chamar a API
{
  calls = [];
  const r = await ai.aiPet(req({ ...base, text: 'meu zap é 11 98765-4321' }), env, { fetch: fakeFetch('{}') });
  const j = await r.json();
  assert.equal(j.blocked, 'pii');
  assert.equal(j.source, 'safety');
  assert.equal(calls.length, 0);
  ok('dado pessoal na entrada → recusa gentil, sem chamada');
}

// 5) palavrão na entrada → resposta segura
{
  calls = [];
  const r = await ai.aiPet(req({ ...base, text: 'você é um idiota' }), env, { fetch: fakeFetch('{}') });
  const j = await r.json();
  assert.equal(j.blocked, 'bad');
  assert.equal(calls.length, 0);
  ok('insulto na entrada → reação fofa, sem chamada');
}

// 6) saída ruim do modelo → substituída
{
  const r = await ai.aiPet(req(base), env, { fetch: fakeFetch('{"reply":"me manda seu whatsapp","emotion":"happy"}') });
  const j = await r.json();
  assert.equal(j.source, 'safety');
  assert.doesNotMatch(j.reply, /whatsapp/i);
  ok('moderação da saída');
}

// 7) erro da API → 502/503 (app cai no bot local)
{
  const r = await ai.aiPet(req(base), env, { fetch: fakeFetch('', 500) });
  assert.ok(r.status === 502 || r.status === 503);
  ok('erro da API → fallback');
}

// 8) limite por minuto
{
  const env2 = { DATA: kv(), ANTHROPIC_API_KEY: 'sk-test-fake' };
  const f = fakeFetch('{"reply":"Oi!","emotion":"happy"}');
  let last;
  for (let i = 0; i < ai.AI_LIMITS.perMinute + 1; i++) last = await ai.aiPet(req(base, '9.9.9.9'), env2, { fetch: f, now: () => 1e12 });
  assert.equal(last.status, 429);
  ok('limite por minuto → 429');
}

rmSync(dir, { recursive: true, force: true });
console.log(`ai-pet: ${pass} testes ok`);
