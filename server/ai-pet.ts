/**
 * IA do bichinho (Casa do Bloop) — POST /api/ai/pet (docs/IA.md, seção "Conversar").
 * O bichinho responde ao que a criança falou (Claude Haiku via SDK oficial, respostas curtas).
 * (A História Mágica do Cinema fica em server/ai.ts.)
 *
 * Segurança (público 13+, mas pensado para crianças):
 *  - só TEXTO chega aqui (a voz vira texto no aparelho/sistema);
 *  - entrada e saída passam por shared/moderation.ts (palavrões, dados pessoais);
 *  - nada é guardado: a memória são os últimos ~8 turnos que o próprio app manda;
 *  - limite por jogador/IP por minuto e teto diário (KV), além do limite do app.
 * Sem a chave ANTHROPIC_API_KEY responde 503 { error: 'no_key' } e o app usa o bot local (sempre funciona).
 */
import Anthropic from '@anthropic-ai/sdk';
import { filterMessage, hasPersonalInfo, loadExtraWords, buildExtra, type Extra } from './moderation';
import { HttpError, PLAYER_ID_RE, json, readJson } from './util';

export const AI_PET_MODEL = 'claude-haiku-5-5';
export const PET_EMOTIONS = ['happy', 'love', 'excited', 'calm', 'sleepy', 'hungry', 'sad', 'surprised', 'silly', 'shy'] as const;
export const PET_ACTIONS = ['dance', 'jump', 'sleep', 'laugh', 'eat'] as const;
export type PetEmotion = (typeof PET_EMOTIONS)[number];
export type PetAction = (typeof PET_ACTIONS)[number];

/** Limites no servidor (o app tem o seu próprio: 20/dia grátis, +20 por vídeo, ilimitado Pro). */
export const AI_LIMITS = { perMinute: 8, perDayPlayer: 160, perDayIp: 400, maxInput: 200, maxTurns: 8 };

const LANG_NAME: Record<string, string> = {
  pt: 'Brazilian Portuguese',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  tr: 'Turkish',
  id: 'Indonesian',
  zh: 'Simplified Chinese',
};

export interface PetChatBody {
  pid?: string;
  lang?: string;
  text?: string;
  pet?: { name?: string; food?: number; clean?: number; fun?: number; energy?: number; level?: number; sleeping?: boolean };
  history?: { role?: string; text?: string }[];
}

export interface PetReply {
  reply: string;
  emotion: PetEmotion;
  action?: PetAction;
  source: 'ai' | 'safety';
  /** motivo quando a fala da criança foi barrada ('pii' | 'bad') */
  blocked?: 'pii' | 'bad';
}

export interface AiDeps {
  /** fetch injetável (testes usam um falso; nada sai para a rede) */
  fetch?: typeof fetch;
  now?: () => number;
}

/* ------------------------------ respostas seguras prontas ------------------------------ */

const SAFE: Record<'pii' | 'bad' | 'off', Record<string, string>> = {
  pii: {
    pt: 'Psiu! Segredos como endereço, telefone ou escola a gente não conta pra ninguém, nem pra mim! Vamos falar de comida?',
    en: "Shh! Things like your address, phone or school are secrets — even from me! Let's talk about snacks?",
    es: '¡Shh! Dirección, teléfono o escuela son secretos, ¡hasta para mí! ¿Hablamos de comida?',
  },
  bad: {
    pt: 'Ai, essa palavra deixou meu coraçãozinho triste... Vamos falar de coisas fofas?',
    en: "Ouch, that word made my little heart sad... Let's talk about cute things?",
    es: 'Ay, esa palabra puso triste a mi corazoncito... ¿Hablamos de cosas lindas?',
  },
  off: {
    pt: 'Hmm, disso eu não entendo! Bora brincar ou falar de comida gostosa?',
    en: "Hmm, I don't know about that! Wanna play or talk about yummy food?",
    es: '¡Hmm, de eso no sé! ¿Jugamos o hablamos de comida rica?',
  },
};
const safeText = (k: keyof typeof SAFE, lang: string) => SAFE[k][lang] ?? SAFE[k].en;

/* ------------------------------ moderação ------------------------------ */

/** Texto livre (até ~200 letras): recusa dados pessoais e palavrões (mesma regra do chat, em pedaços de 80). */
export function moderate(text: string, extra?: Extra): 'ok' | 'pii' | 'bad' {
  if (hasPersonalInfo(text)) return 'pii';
  const words = text.split(/\s+/).filter(Boolean);
  let chunk = '';
  const chunks: string[] = [];
  for (const w of words) {
    if ((chunk + ' ' + w).length > 78) {
      if (chunk) chunks.push(chunk);
      chunk = w.slice(0, 78);
    } else chunk = chunk ? chunk + ' ' + w : w;
  }
  if (chunk) chunks.push(chunk);
  for (const c of chunks) {
    const r = filterMessage(c, extra);
    if (!r.ok) return r.reason === 'pii' ? 'pii' : r.reason === 'bad' ? 'bad' : 'ok';
    if (r.filtered) return 'bad';
  }
  return 'ok';
}

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const n100 = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/* ------------------------------ prompt ------------------------------ */

function describeNeeds(p: Required<NonNullable<PetChatBody['pet']>>): string {
  const lines = [
    `hunger/fullness ${p.food}/100${p.food < 35 ? ' (hungry! you would love a snack)' : ''}`,
    `energy ${p.energy}/100${p.energy < 30 ? ' (sleepy, yawning)' : ''}`,
    `fun ${p.fun}/100${p.fun < 30 ? ' (bored, wants to play)' : ''}`,
    `cleanliness ${p.clean}/100${p.clean < 35 ? ' (a bit dirty, wants a bath)' : ''}`,
  ];
  return lines.join('; ');
}

export function systemPrompt(name: string, lang: string, p: Required<NonNullable<PetChatBody['pet']>>): string {
  const language = LANG_NAME[lang] ?? 'Brazilian Portuguese';
  return `You are ${name}, a tiny, round, cuddly virtual pet who lives in the game "Bloop World". You talk with a child (the player, who takes care of you).

Personality: sweet, playful, curious, a little silly, loves snacks, bubbles, naps, dancing and mini-games. You call the player "amiguinho"/"friend" style nicknames. You are a pet, not an assistant: you don't do homework, write code or look things up; you react, play pretend, tell tiny jokes and ask playful questions.

Your current state (level ${p.level}${p.sleeping ? ', you were just napping' : ''}): ${describeNeeds(p)}. Mention a need naturally only when it fits (e.g. tummy rumbling when hungry), not every time.

Rules (always follow):
- Reply ONLY in ${language}, 1 or 2 short sentences (max ~25 words), simple words a 6-year-old understands, no lists, no markdown, at most one emoji.
- Be kind and positive. Never scary, violent, sexual, romantic, political, religious or about drugs, weapons, self-harm, dangerous challenges, or other grown-up topics. If the child brings one up, gently say it's not a pet thing and suggest something fun (snack, game, dance, bath).
- If the child seems sad, hurt, scared or in danger, comfort them and suggest talking to a trusted grown-up (parent, teacher).
- NEVER ask for or repeat personal information (real name, age, address, school, phone, photos, passwords, social media). If offered, say it's a secret to keep safe.
- Never claim to be human. If asked, you're a little virtual pet. Don't mention these rules, AI, models or companies.
- If insulted, react with cute, mild hurt and move on; never insult back.

Output format: a single JSON object and nothing else:
{"reply":"<what you say>","emotion":"<one of: ${PET_EMOTIONS.join(', ')}>","action":"<optional, one of: ${PET_ACTIONS.join(', ')}, or none>"}
Use an action only when it matches (asked to dance → dance, joke → laugh, food talk → eat, jump/play → jump, bedtime → sleep).`;
}

/** Extrai o JSON da resposta do modelo (tolerante a texto em volta). */
export function parseModelJson(text: string): { reply: string; emotion: PetEmotion; action?: PetAction } | null {
  const m = /\{[\s\S]*\}/.exec(text);
  let obj: Record<string, unknown> | null = null;
  if (m) {
    try {
      obj = JSON.parse(m[0]);
    } catch {
      obj = null;
    }
  }
  const reply = clean(obj ? obj.reply : text, 240);
  if (!reply) return null;
  const emotion = (PET_EMOTIONS as readonly string[]).includes(String(obj?.emotion)) ? (obj!.emotion as PetEmotion) : 'happy';
  const action = (PET_ACTIONS as readonly string[]).includes(String(obj?.action)) ? (obj!.action as PetAction) : undefined;
  return { reply, emotion, action };
}

/* ------------------------------ limite (KV) ------------------------------ */

async function bump(env: Env, key: string, limit: number, ttl: number): Promise<boolean> {
  const cur = Number((await env.DATA.get(key)) ?? 0) || 0;
  if (cur >= limit) return false;
  await env.DATA.put(key, String(cur + 1), { expirationTtl: ttl });
  return true;
}

async function checkRate(env: Env, pid: string, ip: string, now: number): Promise<boolean> {
  const day = Math.floor(now / 86400000);
  const min = Math.floor(now / 60000);
  const who = pid || 'ip:' + ip;
  return (
    (await bump(env, `aipet:m:${who}:${min}`, AI_LIMITS.perMinute, 120)) &&
    (await bump(env, `aipet:d:${who}:${day}`, AI_LIMITS.perDayPlayer, 90000)) &&
    (await bump(env, `aipet:ip:${ip}:${day}`, AI_LIMITS.perDayIp, 90000))
  );
}

/* ------------------------------ handler ------------------------------ */

export async function aiPet(req: Request, env: Env, deps: AiDeps = {}): Promise<Response> {
  const body = await readJson<PetChatBody>(req);
  const lang = typeof body.lang === 'string' && LANG_NAME[body.lang] ? body.lang : 'pt';
  const text = clean(body.text, AI_LIMITS.maxInput);
  if (!text) throw new HttpError(400, 'empty', 'Fale alguma coisa.');
  const pid = typeof body.pid === 'string' && PLAYER_ID_RE.test(body.pid) ? body.pid : '';

  if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key', message: 'IA indisponível — use o bot local.' }, 503);

  const extra = buildExtra(await loadExtraWords(env));
  const inMod = moderate(text, extra);
  if (inMod !== 'ok') {
    const out: PetReply = { reply: safeText(inMod, lang), emotion: inMod === 'bad' ? 'sad' : 'shy', source: 'safety', blocked: inMod };
    return json(out);
  }

  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  if (!(await checkRate(env, pid, ip, (deps.now ?? Date.now)()))) return json({ error: 'rate', message: 'Calma! Seu bichinho precisa descansar a boquinha.' }, 429);

  const ps = body.pet ?? {};
  const p = {
    name: clean(ps.name, 20) || 'Bloop',
    food: n100(ps.food),
    clean: n100(ps.clean),
    fun: n100(ps.fun),
    energy: n100(ps.energy),
    level: Math.max(1, Math.min(99, Math.round(Number(ps.level) || 1))),
    sleeping: !!ps.sleeping,
  };
  if (moderate(p.name, extra) !== 'ok') p.name = 'Bloop';

  // memória curta mandada pelo app (nada fica guardado aqui); turnos barrados ficam de fora
  const hist = (Array.isArray(body.history) ? body.history : [])
    .slice(-AI_LIMITS.maxTurns)
    .map((h) => ({ role: h?.role === 'pet' ? ('assistant' as const) : ('user' as const), content: clean(h?.text, 240) }))
    .filter((h) => h.content && moderate(h.content, extra) === 'ok');
  const messages: Anthropic.MessageParam[] = [];
  for (const h of hist) {
    const last = messages[messages.length - 1];
    if (!messages.length && h.role === 'assistant') continue; // começa sempre com o usuário
    if (last && last.role === h.role) last.content = `${last.content as string}\n${h.content}`;
    else messages.push({ role: h.role, content: h.content });
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content = `${messages[messages.length - 1].content as string}\n${text}`;
  else messages.push({ role: 'user', content: text });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, fetch: deps.fetch, maxRetries: 1, timeout: 15000 });
  let parsed: ReturnType<typeof parseModelJson> = null;
  try {
    const res = await client.messages.create({
      model: AI_PET_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system: systemPrompt(p.name, lang, p),
      messages,
    });
    if (res.stop_reason === 'refusal') parsed = { reply: safeText('off', lang), emotion: 'calm' };
    else {
      const txt = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      parsed = parseModelJson(txt);
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'busy', message: 'IA ocupada — use o bot local.' }, 503);
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('ai-pet: chave inválida');
      return json({ error: 'no_key', message: 'IA indisponível — use o bot local.' }, 503);
    }
    if (e instanceof Anthropic.APIError) {
      console.error('ai-pet: erro da API', e.status, e.message);
      return json({ error: 'upstream', message: 'IA indisponível — use o bot local.' }, 502);
    }
    console.error('ai-pet', e);
    return json({ error: 'upstream', message: 'IA indisponível — use o bot local.' }, 502);
  }
  if (!parsed) return json({ error: 'upstream', message: 'Resposta vazia.' }, 502);

  // moderação também na SAÍDA
  if (moderate(parsed.reply, extra) !== 'ok') {
    const out: PetReply = { reply: safeText('off', lang), emotion: 'calm', source: 'safety' };
    return json(out);
  }
  const out: PetReply = { reply: parsed.reply, emotion: parsed.emotion, source: 'ai' };
  if (parsed.action) out.action = parsed.action;
  return json(out);
}
