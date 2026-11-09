/**
 * Perfil do jogador escolhido no onboarding: apelido, @nome e Programa Beta.
 *
 *  - Guardado em localStorage 'bw-profile-v1' (funciona 100% offline).
 *  - Apelido → online.setPlayerName (sincroniza com o servidor em segundo plano).
 *  - @nome: validado na hora com as MESMAS regras do servidor (shared/handle-rules).
 *    Com internet, confere disponibilidade e reserva (services/home.ts, via import.meta.glob).
 *    Sem internet, fica "pendente" e é reservado depois (syncPendingHandle, ao voltar a rede).
 */
import { bus } from '../core/events';
import { t } from '../i18n';
import { handleRuleProblem, nickProblem, normalizeHandle } from '../../shared/handle-rules';
import type { HandleCheck, HomeApi } from '../home/api';
import { getPlayer, setPlayerName } from './online';

const KEY = 'bw-profile-v1';

export type HandleStatus = 'none' | 'pending' | 'ok' | 'conflict';

export interface Profile {
  /** onboarding concluído (ou pulado) */
  onboarded: boolean;
  nick: string;
  /** @nome sem o @ (minúsculo) */
  handle: string;
  handleStatus: HandleStatus;
  beta: boolean;
  betaSince: number;
}

function load(): Profile {
  const d: Profile = { onboarded: false, nick: '', handle: '', handleStatus: 'none', beta: false, betaSince: 0 };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') return { ...d, ...o };
  } catch {
    /* */
  }
  return d;
}

export const profile: Profile = load();

export function saveProfile(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* privado/cheio */
  }
  bus.emit('profile');
}

/* ---------------- API do @nome (carregada só se existir no build) ---------------- */

const mods = import.meta.glob('./home.ts');
let apiP: Promise<HomeApi | null> | null = null;
function homeApi(): Promise<HomeApi | null> {
  apiP ??= (async () => {
    const load = mods['./home.ts'];
    if (!load) return null;
    try {
      return ((await load()) as { homeApi?: HomeApi }).homeApi ?? null;
    } catch {
      return null;
    }
  })();
  return apiP;
}

/** @nome que o servidor já tem para este aparelho (ex.: reinstalou) — null se não souber. */
export async function serverHandle(): Promise<string | null> {
  return (await homeApi())?.myHandle() ?? null;
}

/* ---------------- regras ---------------- */

export type NickIssue = ReturnType<typeof nickProblem>;
export function nickIssueText(p: NickIssue): string {
  switch (p) {
    case 'short':
      return t('ob.nickShort', 'Use pelo menos 2 letras.');
    case 'long':
      return t('ob.nickLong', 'No máximo 20 letras.');
    case 'pii':
      return t('ob.nickPii', 'Sem telefone, e-mail, endereço ou rede social, tá?');
    case 'bad':
      return t('ob.nickBad', 'Hmm, esse nome não pode. Que tal outro bem legal?');
    default:
      return '';
  }
}
export const checkNick = (n: string): NickIssue => nickProblem(n);

/** Normaliza o que a pessoa digita no campo do @ (minúsculas, só a-z 0-9 _ .). */
export const cleanHandleInput = (s: string): string =>
  normalizeHandle(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 16);

export function handleLocalIssue(h: string): 'invalid' | 'blocked' | null {
  return handleRuleProblem(cleanHandleInput(h));
}

/* ---------------- nomes divertidos ---------------- */

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const words = (list: string): string[] =>
  list
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

/** Apelido divertido gerado ("Cometa Veloz", "Pipoca 42"...). Sempre passa no filtro. */
export function funName(): string {
  const a = words(t('ob.funA', 'Cometa,Pipoca,Nuvem,Bolha,Faísca,Pixel,Foguete,Estrela,Trovão,Biscoito,Panda,Raio'));
  const b = words(t('ob.funB', 'Veloz,Feliz,Mágico,Azul,Turbo,Brilhante,Saltitante,Doido,Cósmico,Gigante'));
  for (let i = 0; i < 8; i++) {
    const n = Math.random() < 0.7 ? `${pick(a)} ${pick(b)}` : `${pick(a)} ${10 + Math.floor(Math.random() * 90)}`;
    if (n.length <= 20 && !nickProblem(n)) return n;
  }
  return `Bloop ${1000 + Math.floor(Math.random() * 9000)}`;
}

/** Sugestões locais de @ a partir do apelido (válidas pelas regras; disponibilidade só online). */
export function localSuggestions(base: string, n = 4): string[] {
  const root =
    cleanHandleInput(base.replace(/\s+/g, '_'))
      .replace(/^[_.]+/, '')
      .replace(/[_.]+$/, '')
      .slice(0, 11) || 'bloop';
  const cute = ['star', 'pop', 'fun', 'joy', 'gg', 'zen', 'wow', 'top'];
  const out = new Set<string>();
  for (let i = 0; out.size < n && i < 40; i++) {
    const r = 10 + Math.floor(Math.random() * 990);
    const c = [`${root}${r}`, `${root}_${pick(cute)}`, `${root}.${pick(cute)}`, `${root}_${r}`][i % 4].slice(0, 16);
    if (!handleRuleProblem(c)) out.add(c);
  }
  return [...out];
}

/* ---------------- disponibilidade / reserva ---------------- */

export type HandleState = { kind: 'ok' } | { kind: 'taken' | 'invalid' | 'blocked'; suggestions: string[] } | { kind: 'offline' };

export async function checkHandleOnline(raw: string): Promise<HandleState> {
  const h = cleanHandleInput(raw);
  const local = handleRuleProblem(h);
  if (local) return { kind: local, suggestions: local === 'invalid' ? [] : localSuggestions('amigo') };
  if (navigator.onLine === false) return { kind: 'offline' };
  const api = await homeApi();
  if (!api) return { kind: 'offline' };
  let r: HandleCheck;
  try {
    // resposta lenta = tratamos como offline (o @ fica pendente e é confirmado depois)
    r = await Promise.race([api.checkHandle(h), new Promise<HandleCheck>((res) => setTimeout(() => res({ ok: false, reason: 'network' }), 4000))]);
  } catch {
    return { kind: 'offline' };
  }
  if (!r || typeof r !== 'object') return { kind: 'offline' };
  if (r.ok) return { kind: 'ok' };
  // 'invalid' com as regras locais OK = servidor fora do ar/rota inexistente (404) → tratamos como offline
  if (r.reason !== 'taken' && r.reason !== 'blocked') return { kind: 'offline' };
  return { kind: r.reason, suggestions: r.suggestions ?? [] };
}

/**
 * Tenta reservar o @ agora. 'ok' = reservado; 'pending' = sem rede (fica para depois);
 * 'taken'/'invalid'/'blocked' = precisa escolher outro.
 */
export async function claimHandle(raw: string): Promise<'ok' | 'pending' | 'taken' | 'invalid' | 'blocked'> {
  const h = cleanHandleInput(raw);
  const local = handleRuleProblem(h);
  if (local) return local;
  const api = navigator.onLine === false ? null : await homeApi();
  let res: 'ok' | 'pending' | 'taken' | 'invalid' | 'blocked' = 'pending';
  if (api) {
    try {
      const r = await Promise.race([api.claimHandle(h), new Promise<HandleCheck>((res) => setTimeout(() => res({ ok: false, reason: 'network' }), 6000))]);
      if (!r || typeof r !== 'object') res = 'pending';
      else if (r.ok) res = 'ok';
      else if (r.reason === 'taken' || r.reason === 'blocked') res = r.reason;
      // 'network', troca bloqueada por 30 dias (until) ou servidor ainda não publicado (404 → 'invalid'): tenta depois
      else res = 'pending';
    } catch {
      res = 'pending';
    }
  }
  if (res === 'ok' || res === 'pending') {
    profile.handle = h;
    profile.handleStatus = res;
  } else if (profile.handle === h) profile.handleStatus = 'conflict'; // o pendente foi pego por outra pessoa
  saveProfile();
  return res;
}

let syncing = false;
/** Reserva em segundo plano um @ que ficou pendente (chamado ao voltar a rede / abrir o app). */
export async function syncPendingHandle(): Promise<void> {
  if (syncing || profile.handleStatus !== 'pending' || !profile.handle) return;
  syncing = true;
  try {
    const r = await claimHandle(profile.handle);
    if (r === 'ok') bus.emit('toast', t('ob.handleConfirmed', '@{h} confirmado!', { h: profile.handle }));
    else if (r !== 'pending') bus.emit('toast', t('ob.handleConflict', 'Ops! @{h} já tem dono. Escolha outro em Ajustes.', { h: profile.handle }));
  } finally {
    syncing = false;
  }
}

/** Salva o apelido no perfil + online (que envia ao servidor quando der). */
export function applyNick(n: string): void {
  const clean = n.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!clean || nickProblem(clean)) return;
  profile.nick = clean;
  saveProfile();
  if (getPlayer()?.name !== clean) setPlayerName(clean);
}

/** Liga a sincronização em segundo plano do @ pendente. */
export function initProfileSync(): void {
  window.addEventListener('online', () => void syncPendingHandle());
  bus.on('online', (ok: boolean) => ok && void syncPendingHandle());
  setTimeout(() => void syncPendingHandle(), 4000);
  // perfil antigo sem @ mas o servidor já sabe: adota
  if (profile.handleStatus === 'none')
    setTimeout(async () => {
      const h = await serverHandle().catch(() => null);
      if (h && profile.handleStatus === 'none') {
        profile.handle = h;
        profile.handleStatus = 'ok';
        saveProfile();
      }
    }, 6000);
}
