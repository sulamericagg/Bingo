/**
 * Tipos e utilitários compartilhados entre o jogo (src/) e o servidor (server/).
 * Não importe nada de DOM/Capacitor aqui: este arquivo também roda no Cloudflare Worker.
 */

export interface RewardBoosts {
  shield?: number;
  magnet?: number;
  headstart?: number;
}

/** Pacote de recompensa (presente, código ou desafio). */
export interface RewardPack {
  coins?: number;
  gems?: number;
  skins?: string[];
  trails?: string[];
  noAds?: boolean;
  boosts?: RewardBoosts;
  title?: string;
  message?: string;
}

/** Presente pendente na caixa de entrada do jogador. */
export interface Gift {
  id: string;
  title: string;
  message: string;
  reward: RewardPack;
  sentAt: number;
  expiresAt: number | null;
}

export type RedeemError = 'invalid' | 'expired' | 'used' | 'limit';

export interface RedeemResult {
  ok: boolean;
  reward?: RewardPack;
  error?: RedeemError | 'network';
}

export interface PublicChallenge {
  id: string;
  title: string;
  description: string;
  link: string;
  startsAt: number | null;
  endsAt: number | null;
  reward: RewardPack;
}

/** Normaliza um código: maiúsculas, sem espaços, hífens, underlines ou pontos. */
export function normalizeCode(code: string): string {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 40);
}

const ID_RE = /^[a-z0-9_-]{1,40}$/i;
const clampInt = (v: unknown, max: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};
const cleanText = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);

/** Valida/limpa um pacote vindo de fora (painel ou rede). Remove campos vazios. */
export function sanitizePack(input: unknown): RewardPack {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const out: RewardPack = {};
  const coins = clampInt(p.coins, 10_000_000);
  const gems = clampInt(p.gems, 1_000_000);
  if (coins) out.coins = coins;
  if (gems) out.gems = gems;
  const ids = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter((x) => ID_RE.test(x)))].slice(0, 60) : [];
  const skins = ids(p.skins);
  const trails = ids(p.trails);
  if (skins.length) out.skins = skins;
  if (trails.length) out.trails = trails;
  if (p.noAds === true) out.noAds = true;
  if (p.boosts && typeof p.boosts === 'object') {
    const b: RewardBoosts = {};
    for (const k of ['shield', 'magnet', 'headstart'] as const) {
      const n = clampInt(p.boosts[k], 999);
      if (n) b[k] = n;
    }
    if (Object.keys(b).length) out.boosts = b;
  }
  const title = cleanText(p.title, 60);
  const message = cleanText(p.message, 300);
  if (title) out.title = title;
  if (message) out.message = message;
  return out;
}

/** true se o pacote não dá nada (só título/mensagem). */
export function packIsEmpty(p: RewardPack): boolean {
  return !p.coins && !p.gems && !p.skins?.length && !p.trails?.length && !p.noAds && !p.boosts;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

/**
 * Resumo legível em pt-BR: "500 moedas, 20 gemas, skin Rei Dourado e sem anúncios".
 * `names` traduz ids de skins/rastros para nomes (opcional).
 */
export function packSummary(p: RewardPack, names: Record<string, string> = {}): string {
  const parts: string[] = [];
  if (p.coins) parts.push(plural(p.coins, 'moeda', 'moedas'));
  if (p.gems) parts.push(plural(p.gems, 'gema', 'gemas'));
  if (p.skins?.length) parts.push(`${p.skins.length === 1 ? 'skin' : 'skins'} ${p.skins.map((s) => names[s] ?? s).join(', ')}`);
  if (p.trails?.length) parts.push(`${p.trails.length === 1 ? 'rastro' : 'rastros'} ${p.trails.map((s) => names['trail:' + s] ?? names[s] ?? s).join(', ')}`);
  if (p.boosts?.shield) parts.push(plural(p.boosts.shield, 'escudo', 'escudos'));
  if (p.boosts?.magnet) parts.push(plural(p.boosts.magnet, 'ímã', 'ímãs'));
  if (p.boosts?.headstart) parts.push(plural(p.boosts.headstart, 'largada turbo', 'largadas turbo'));
  if (p.noAds) parts.push('sem anúncios');
  if (!parts.length) return 'um presente surpresa';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
}
