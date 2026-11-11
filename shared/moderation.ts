/**
 * Filtro de chat (kid-safe). Compartilhado: o servidor é a fonte da verdade; o app usa a mesma regra offline (apelido/@nome).
 *
 * Etapas:
 *  1. Dados pessoais (telefone, e-mail, links, @perfis, endereços, "zap/insta/telegram"...)
 *     → mensagem RECUSADA com aviso amigável.
 *  2. Normalização: minúsculas, sem acentos, leetspeak (4→a, 3→e, 0→o, @→a, $→s...),
 *     letras repetidas ("merdaaa" → "merda"), letras separadas ("p u t a", "p.u.t.a").
 *  3. Palavras proibidas (pt/en/es — palavrões, insultos, termos sexuais, ofensas):
 *     palavra inteira → trocada por ###; disfarçada (letras separadas/grudadas) → recusada.
 *
 * A lista extra (painel admin → Moderação) entra junto, guardada no KV em `chat:words`.
 */

export type FilterReason = 'empty' | 'long' | 'pii' | 'bad';
export interface FilterResult {
  ok: boolean;
  text: string;
  /** true se alguma palavra foi trocada por ### */
  filtered: boolean;
  reason?: FilterReason;
}

export const CHAT_MAX_LEN = 80;

/* Palavras comparadas como PALAVRA INTEIRA (após normalizar e colapsar repetições). */
const WORDS = `
porra merda bosta puta puto putas putos fdp vsf pqp vtnc tnc krl crl cu cus bicha viado viados bixa
idiota idiotas imbecil babaca burro burra otario otaria retardado retardada vagabundo vagabunda safado safada corno corna
broxa gostosa pelada pelado nude nudes transar transa sexo sexy rola piru bunda bundao peitos xota xana
desgracado desgracada lixo nojento nojenta feio feia trouxa mongoloide energumeno
fuck fck fuk shit sht bitch btch ass asshole bastard dick dicks cock cocks pussy cunt slut whore fag fags faggot
retard retarded porn porno sex nude naked boobs tits penis vagina kys stfu wtf dumb dumbass moron idiot idiots stupid twat wanker rape
nigga nigger macaca nazi penis whore
mierda joder jodete cono pendejo pendeja cabron cabrona verga chinga chingar chingada maricon marica culero culo gilipollas
polla zorra perra hijueputa hdp ctm malparido follar tetas estupido estupida imbecil puta
`;

/* Raízes procuradas DENTRO do texto todo "grudado" (pega disfarces como "c4r4lh0", "f.u.c.k"). */
const STEMS = `
caralho caralh buceta boceta xoxota xereca piroca cuzao arrombad punheta siririca foder fodase fudid fodid putaria
fuck fuckin motherf bitch asshol pussy cunt slut faggot nigg boobs vagin dumbass wanker
mierda joder pendej cabron chingad maricon culero gilipoll hijueput malparid follar conchetumadr
nazista hitler suicid vaitematar teodeio
`;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e' };

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

function leet(s: string): string {
  let o = '';
  for (const ch of s) o += LEET[ch] ?? ch;
  return o;
}

/** token cru → forma comparável (só letras, sem repetições) */
export function normWord(tok: string): string {
  return collapse(leet(stripAccents(tok.toLowerCase())).replace(/[^a-z]/g, ''));
}

const baseWords = new Set(WORDS.split(/\s+/).filter(Boolean).map(normWord));
const baseStems = STEMS.split(/\s+/).filter(Boolean).map(normWord);

/* ---------------- dados pessoais ---------------- */

const PII: RegExp[] = [
  /(\d[\s().\-_/]*){7,}/, // telefone / documento / CEP+número
  /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|arroba)\s*[a-z0-9-]+\s*(\.|\bdot\b|\bponto\b)\s*[a-z]{2,}/i, // e-mail
  /(https?:\/\/|www\s*\.|\b[a-z0-9-]{2,}\s*(\.|\bdot\b|\bponto\b)\s*(com|net|org|br|io|gg|me|ly|xyz|app|tv|co|info|link|site|online|club)\b)/i, // links
  /(^|\s)@[a-z0-9_.]{2,}/i, // @perfil
  /\b(rua|avenida|av\.|travessa|alameda|rodovia|calle|carrera|street|road|cep|bairro|apto|apartamento|condominio)\s+\S+/i,
  /\b(moro (na|no|em)|meu endereco|minha escola|my address|i live (in|at|on)|vivo en|mi direccion|mi escuela)\b/i,
];
/* procurados no texto normalizado grudado */
const CONTACT_STEMS = ['whatsapp', 'zapzap', 'instagram', 'telegram', 'tiktok', 'snapchat', 'facebook', 'meunumero', 'mynumber', 'minumero', 'meutelefone', 'meucel', 'celular', 'telefone', 'skype', 'email'].map(
  normWord,
);
/* palavras inteiras (curtas, perigosas como substring) */
const CONTACT_WORDS = new Set(['zap', 'wpp', 'whats', 'insta', 'discord', 'kik', 'phone', 'tel', 'cel', 'snap', 'face', 'ig', 'dc', 'tg', 'fb'].map(normWord));

export function hasPersonalInfo(raw: string): boolean {
  const low = stripAccents(raw.toLowerCase());
  if (PII.some((r) => r.test(low))) return true;
  const toks = low.split(/[^a-z0-9@$!|+]+/).filter(Boolean);
  if (toks.some((t) => CONTACT_WORDS.has(normWord(t)))) return true;
  const compact = collapse(leet(low).replace(/[^a-z]/g, ''));
  return CONTACT_STEMS.some((s) => compact.includes(s));
}

/* ---------------- palavrões ---------------- */

export interface Extra {
  words: Set<string>;
  stems: string[];
}
export function buildExtra(list: string[]): Extra {
  const words = new Set<string>();
  const stems: string[] = [];
  for (const w of list) {
    const n = normWord(w);
    if (!n) continue;
    words.add(n);
    if (n.length >= 5) stems.push(n);
  }
  return { words, stems };
}
const EMPTY: Extra = { words: new Set(), stems: [] };

const isBad = (n: string, extra: Extra) =>
  !!n && (baseWords.has(n) || extra.words.has(n) || (n.length > 3 && n.endsWith('s') && (baseWords.has(n.slice(0, -1)) || extra.words.has(n.slice(0, -1)))));

export function filterMessage(input: unknown, extra: Extra = EMPTY): FilterResult {
  const raw = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return { ok: false, text: '', filtered: false, reason: 'empty' };
  if ([...raw].length > CHAT_MAX_LEN) return { ok: false, text: '', filtered: false, reason: 'long' };
  if (hasPersonalInfo(raw)) return { ok: false, text: '', filtered: false, reason: 'pii' };

  // 1) palavras inteiras → ###
  const parts = raw.split(/(\s+)/);
  let filtered = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.trim()) continue;
    // "merda!!", "(idiota)" — testa o token inteiro e também quebrado por pontuação
    const pieces = p.split(/[.,;:?¿¡"'()[\]{}\-_/\\*~^]+/).filter(Boolean);
    if (isBad(normWord(p), extra) || pieces.some((x) => isBad(normWord(x), extra))) {
      parts[i] = '###';
      filtered = true;
    }
  }
  const text = parts.join('');

  // 2) disfarces: letras separadas ("p u t a", "p.u.t.a") e raízes no texto grudado
  const low = stripAccents(text.toLowerCase()).replace(/###/g, ' ');
  const singles = low.split(/[^a-z0-9@$!|+]+/).filter(Boolean);
  let run = '';
  for (const tok of [...singles, '']) {
    if (tok.length === 1) run += tok;
    else {
      if (run.length >= 2 && isBad(normWord(run), extra)) return { ok: false, text: '', filtered: false, reason: 'bad' };
      run = '';
    }
  }
  const compact = collapse(leet(low).replace(/[^a-z]/g, ''));
  if (baseStems.some((s) => compact.includes(s)) || extra.stems.some((s) => compact.includes(s))) return { ok: false, text: '', filtered: false, reason: 'bad' };

  // tudo virou ###? recusa (não vale a pena mostrar)
  if (filtered && !text.replace(/###/g, '').replace(/[\s\W]/g, '')) return { ok: false, text: '', filtered: true, reason: 'bad' };
  return { ok: true, text, filtered };
}

/** Mensagens amigáveis (o cliente traduz pelo `reason`; este texto é o fallback). */
export const REASON_TEXT: Record<FilterReason | 'rate' | 'muted' | 'banned', string> = {
  empty: 'Escreva alguma coisa.',
  long: 'Mensagem muito longa (máx. 80 letras).',
  pii: 'Para sua segurança, não compartilhe contatos, links, endereços ou dados pessoais.',
  bad: 'Ops! Vamos manter o chat gentil para todo mundo.',
  rate: 'Calma! Espere um pouquinho antes de mandar outra mensagem.',
  muted: 'Você está silenciado no chat por um tempo.',
  banned: 'Seu acesso ao chat foi bloqueado.',
};

/** Nome exibido: limpa e, se ofensivo ou com dado pessoal, troca por um neutro. */
export function safeName(name: string, extra: Extra = EMPTY): string {
  const r = filterMessage(name, extra);
  if (!r.ok || r.filtered) return 'Bloop';
  return r.text.slice(0, 20);
}

/**
 * Texto longo (relatórios de bug, até ~1000 letras): não recusa — mascara palavrões (###) e
 * apaga dados pessoais óbvios (telefone, e-mail, links, @perfis). Usado em /api/feedback.
 */
export function maskLongText(input: unknown, max = 1000, extra: Extra = EMPTY): { text: string; filtered: boolean; pii: boolean } {
  const raw = String(input ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff<>]/g, ' ')
    .slice(0, max);
  // 1) palavrões → ###
  let filtered = false;
  let text = raw
    .split(/(\s+)/)
    .map((p) => {
      if (!p.trim()) return p;
      const pieces = p.split(/[.,;:?¿¡"'()[\]{}\-_/\\*~^]+/).filter(Boolean);
      if (isBad(normWord(p), extra) || pieces.some((x) => isBad(normWord(x), extra))) {
        filtered = true;
        return '###';
      }
      return p;
    })
    .join('');
  // 2) dados pessoais óbvios → [removido] (sem o "adivinhador" de domínio do chat: "parede. Me" não é link)
  let pii = false;
  for (const r of [PII[0], PII[1], /(https?:\/\/|www\.)\S+/i, PII[3]]) {
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    text = text.replace(g, (m) => {
      pii = true;
      return /^\s/.test(m) ? ' [removido]' : '[removido]';
    });
  }
  return { text: text.trim(), filtered, pii };
}

/* ---------------- varredura com gravidade (TV Bloop: falas, balões e transcrições de voz) ---------------- */

/**
 * Palavras que dependem do contexto ("que feio!", "burro de carga", "dumb robot"): não recusam sozinhas —
 * vão para o moderador humano (e para a IA, se ligada) com o destaque. Tudo o mais da lista é grave.
 */
const MILD = new Set(
  'idiota idiotas imbecil babaca burro burra otario otaria trouxa feio feia lixo nojento nojenta bunda bundao dumb stupid idiot idiots moron estupido estupida'
    .split(/\s+/)
    .map(normWord),
);

const NUM_WORDS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  cero: 0, uno: 1, dos: 2, cuatro: 4, siete: 7, ocho: 8, nueve: 9,
};

/** Número de telefone falado por extenso ("nove nove oito sete...") — contar 1, 2, 3... em ordem não conta. */
function spelledNumber(low: string): string | null {
  const toks = low.split(/[^a-z0-9]+/).filter(Boolean);
  let run: { v: number; w: string }[] = [];
  const check = (): string | null => {
    const digits = run.reduce((n, x) => n + (x.v >= 10 ? String(x.v).length : 1), 0);
    if (digits < 7) return null;
    const vals = run.filter((x) => x.v < 10).map((x) => x.v);
    const counting = vals.length >= 3 && vals.every((v, i) => i === 0 || v === vals[i - 1] + 1);
    return counting ? null : run.map((x) => x.w).join(' ');
  };
  for (const t of [...toks, '']) {
    const v = /^\d+$/.test(t) ? Number(t) : NUM_WORDS[t];
    if (v !== undefined && t) run.push({ v, w: t });
    else {
      const hit = check();
      if (hit) return hit;
      run = [];
    }
  }
  return null;
}

const SCHOOL_LOW = /\b(escola|colegio|school|instituto|creche)\s+(estadual|municipal|particular|publica|emef|emei|e\.?\s?e\.?)\b/;
const SCHOOL_CAP = /\b(?:[Ee]scola|[Cc]ol[ée]gio|[Ss]chool|[Ii]nstituto)\s+(?:(?:d[aoe]s?|of)\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+/;

export type ScanLevel = 'ok' | 'mild' | 'bad' | 'pii';
export interface ScanResult {
  level: ScanLevel;
  /** trechos encontrados (para destacar no painel) */
  hits: string[];
}

/**
 * Varredura de um texto qualquer (fala, balão, transcrição de voz) SEM mascarar: diz a gravidade e o que achou.
 *  pii  = dado pessoal (telefone, e-mail, link, @perfil, endereço, escola, "meu zap"...)
 *  bad  = palavrão/ofensa/termo sexual (inclui disfarces)
 *  mild = insulto que depende do contexto (vai para revisão humana com destaque)
 */
export function scanText(input: unknown, extra: Extra = EMPTY): ScanResult {
  const raw = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
  if (!raw) return { level: 'ok', hits: [] };
  const low = stripAccents(raw.toLowerCase());
  const hits: string[] = [];
  let level: ScanLevel = 'ok';
  const rank: Record<ScanLevel, number> = { ok: 0, mild: 1, bad: 2, pii: 3 };
  const up = (l: ScanLevel, h: string) => {
    if (rank[l] > rank[level]) level = l;
    if (h && !hits.includes(h)) hits.push(h.slice(0, 60));
  };
  // dados pessoais
  for (const r of PII) {
    const m = r.exec(low);
    if (m) up('pii', m[0].trim());
  }
  const sp = spelledNumber(low);
  if (sp) up('pii', sp);
  const sl = SCHOOL_LOW.exec(low) ?? SCHOOL_CAP.exec(raw);
  if (sl) up('pii', sl[0]);
  for (const tok of low.split(/[^a-z0-9@$!|+]+/).filter(Boolean)) if (CONTACT_WORDS.has(normWord(tok))) up('pii', tok);
  const compact = collapse(leet(low).replace(/[^a-z]/g, ''));
  for (const s of CONTACT_STEMS) if (compact.includes(s)) up('pii', s);
  // palavras inteiras
  for (const p of raw.split(/\s+/)) {
    const pieces = [p, ...p.split(/[.,;:?¿¡!"'()[\]{}\-_/\\*~^]+/).filter(Boolean)];
    for (const x of pieces) {
      const n = normWord(x);
      if (!isBad(n, extra)) continue;
      const base = MILD.has(n) || (n.endsWith('s') && MILD.has(n.slice(0, -1)));
      up(base && !extra.words.has(n) ? 'mild' : 'bad', x.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ''));
      break;
    }
  }
  // letras separadas ("p u t a") e raízes grudadas ("c4r4lh0")
  let run = '';
  for (const tok of [...low.split(/[^a-z0-9@$!|+]+/).filter(Boolean), '']) {
    if (tok.length === 1) run += tok;
    else {
      if (run.length >= 2 && isBad(normWord(run), extra)) up('bad', run);
      run = '';
    }
  }
  for (const s of [...baseStems, ...extra.stems]) if (compact.includes(s)) up('bad', s);
  return { level, hits };
}
