/**
 * Corrida Orbital — regras e simulação de bots compartilhadas entre o servidor
 * (Durable Object RaceRoom) e o modo offline do jogo (src/services/multiplayer.ts).
 * Sem DOM e sem dependências: roda no Worker e no navegador.
 */

export const RACE = {
  /** jogadores por sala (completa com bots) */
  players: 5,
  /** duração da corrida (s) */
  durationSec: 60,
  /** espera máxima por jogadores reais desde o 1º a entrar (ms) */
  lobbyWaitMs: 5000,
  /** contagem 3-2-1-JÁ (ms) */
  countdownMs: 3500,
  /** intervalo das atualizações do servidor (ms) */
  tickMs: 200,
};

/** Prêmio por colocação (índice 0 = 1º lugar). Concedido pelo cliente após o resultado. */
export const RACE_REWARDS: { coins: number; gems: number }[] = [
  { coins: 100, gems: 5 },
  { coins: 60, gems: 0 },
  { coins: 40, gems: 0 },
  { coins: 20, gems: 0 },
  { coins: 20, gems: 0 },
];

export const rewardForPlace = (place: number) => RACE_REWARDS[Math.max(0, Math.min(RACE_REWARDS.length - 1, place - 1))];

/** Pontuação máxima plausível depois de `t` segundos de corrida (anti-trapaça simples). */
export const maxPlausibleScore = (t: number) => Math.floor(12 + Math.max(0, t) * 7);

/* ---------------- tipos do protocolo (WebSocket JSON) ---------------- */

export interface RacePlayerInfo {
  slot: number;
  name: string;
  skin: string;
  /** só enviado para clientes em modo debug */
  bot?: boolean;
}

/** Linha de classificação ao vivo: [slot, pontos, planeta atual, vivo(1/0), tempo vivo (décimos de s)] */
export type StandingRow = [number, number, number, 0 | 1, number];

export interface RaceResult {
  slot: number;
  name: string;
  skin: string;
  score: number;
  tAlive: number;
  place: number;
  coins: number;
  gems: number;
  bot?: boolean;
}

export type ClientMsg =
  | { type: 'hello'; id: string; name: string; skin: string; debug?: boolean }
  | { type: 'state'; score: number; p: number; alive: boolean }
  | { type: 'leave' };

export type ServerMsg =
  | { type: 'welcome'; you: number; room: string }
  | { type: 'lobby'; players: RacePlayerInfo[]; startsInMs: number }
  | { type: 'start'; seed: number; countdownMs: number; durationSec: number; players: RacePlayerInfo[]; you: number }
  | { type: 'tick'; t: number; s: StandingRow[] }
  | { type: 'end'; results: RaceResult[] }
  | { type: 'error'; code: string };

/* ---------------- RNG ---------------- */

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- nomes de bots ---------------- */

const NAME_A = [
  'Lucas', 'Mari', 'Gabi', 'Pedro', 'Ana', 'Rafa', 'Bia', 'Duda', 'Leo', 'Julia', 'Enzo', 'Lari', 'Davi', 'Isa', 'Theo', 'Nina',
  'Caio', 'Malu', 'Gui', 'Lele', 'Vini', 'Manu', 'Joao', 'Sofia', 'Thiago', 'Clara', 'Bruno', 'Yasmin', 'Igor', 'Luna',
];
const NAME_B = ['', '', '', '_BR', '07', '2010', 'zinha', 'XD', 'gamer', '_pro', '.exe', '99', '_sp', '_rj', 'zera', 'top', '13', 'kk'];

/** Nome com cara de jogador real (ex.: "Rafa_BR", "Bloop#4821", "duda2010"). */
export function botName(r: () => number, taken: Set<string> = new Set()): string {
  for (let i = 0; i < 20; i++) {
    let n: string;
    const k = r();
    if (k < 0.22) n = `Bloop#${1000 + Math.floor(r() * 9000)}`;
    else {
      n = NAME_A[Math.floor(r() * NAME_A.length)] + NAME_B[Math.floor(r() * NAME_B.length)];
      if (r() < 0.3) n = n.toLowerCase();
    }
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
  return `Bloop#${1000 + Math.floor(r() * 9000)}`;
}

/* ---------------- simulação de bot ---------------- */

/**
 * Modelo de progresso de um bot: pousa em planetas em intervalos que dependem da
 * habilidade e da velocidade do jogo (que sobe com a pontuação), ganha bônus de
 * "perfeito" em sequência e tem uma chance de cair a cada salto.
 */
export interface BotSim {
  skill: number;
  score: number;
  /** planeta atual (índice n no mundo gerado pela seed) */
  p: number;
  alive: boolean;
  /** tempo (s) em que caiu, ou tempo atual se vivo */
  tAlive: number;
  next: number;
  streak: number;
  r: () => number;
}

export function makeBot(seed: number, skill: number): BotSim {
  const r = mulberry32(seed);
  const bot: BotSim = { skill, score: 0, p: 0, alive: true, tAlive: 0, next: 0, streak: 0, r };
  bot.next = 0.6 + jumpInterval(bot) * (0.5 + r());
  return bot;
}

function jumpInterval(b: BotSim): number {
  // velocidade do jogo: igual à rampa do motor (sobe até ~110 pontos)
  const t = Math.min(1, b.score / 110);
  const speed = 1 + 0.6 * (1 - Math.pow(1 - t, 1.6));
  const base = 2.25 - b.skill * 0.95; // s por planeta na velocidade 1
  return (base / (0.55 + speed * 0.45)) * (0.7 + b.r() * 0.6);
}

/** Avança o bot até o instante `t` (s desde a largada). */
export function stepBot(b: BotSim, t: number): void {
  while (b.alive && b.next <= t) {
    // chance de cair neste salto (cresce com a velocidade)
    const risk = (0.042 - b.skill * 0.037) * (1 + b.score / 90);
    if (b.p > 2 && b.r() < risk) {
      b.alive = false;
      b.tAlive = b.next - b.r() * 0.3;
      return;
    }
    b.p++;
    const perfect = b.r() < 0.12 + b.skill * 0.42;
    if (perfect) b.streak++;
    else b.streak = 0;
    b.score += 1 + (perfect ? Math.min(b.streak, 3) : 0);
    b.next += jumpInterval(b);
  }
  if (b.alive) b.tAlive = t;
}

/** Habilidade aleatória de bot (mais bots médios que extremos). */
export function botSkill(r: () => number): number {
  return Math.max(0.15, Math.min(0.95, 0.25 + (r() + r() + r()) / 3 * 0.65));
}

/** Ordena por pontos (empate → mais tempo vivo). */
export function compareStanding(a: { score: number; tAlive: number }, b: { score: number; tAlive: number }): number {
  return b.score - a.score || b.tAlive - a.tAlive;
}
