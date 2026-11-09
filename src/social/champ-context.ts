/**
 * Contexto da rodada de campeonato em andamento.
 *
 * Os jogos NÃO precisam saber de campeonatos: eles só chamam reportRun() (bus 'run-end')
 * como sempre. Antes de abrir o jogo, o painel de campeonatos define
 * `currentChampionshipRound`; quando chega um 'run-end' do MESMO jogo, a pontuação é
 * enviada ao servidor e o contexto é limpo.
 *
 * Opcional para os jogos: getChampionshipSeed(gameId) devolve a seed da rodada (mesma para
 * todos os jogadores) — use-a para gerar a fase, se o jogo suportar seed.
 *
 * O hub pode registrar o próprio lançador (transições/menus) com setGameLauncher();
 * sem isso, o jogo é aberto num contêiner em tela cheia via registry.launch().
 */
import { bus } from '../core/events';
import { listGames, type MiniGameHandle, type RunReport } from '../hub/registry';
import { api } from './net';
import { getPlayer } from '../services/online';

export interface ChampRound {
  champId: string;
  round: number;
  game: string;
  seed: number;
  startedAt: number;
}

export let currentChampionshipRound: ChampRound | null = null;

export function getChampionshipSeed(gameId: string): number | null {
  return currentChampionshipRound && currentChampionshipRound.game === gameId ? currentChampionshipRound.seed : null;
}

type Launcher = (gameId: string, opts: { seed: number; onExit: () => void }) => Promise<boolean>;
let launcher: Launcher | null = null;
export function setGameLauncher(fn: Launcher): void {
  launcher = fn;
}

export const gameAvailable = (gameId: string): boolean => !!launcher || listGames().some((g) => g.id === gameId);

async function defaultLaunch(gameId: string, onExit: () => void): Promise<boolean> {
  const def = listGames().find((g) => g.id === gameId);
  if (!def) return false;
  const root = document.createElement('div');
  root.className = 'sc-game-root';
  root.style.cssText = 'position:fixed;inset:0;z-index:70;background:#0b0620';
  document.body.appendChild(root);
  let handle: MiniGameHandle | null = null;
  let done = false;
  const exit = () => {
    if (done) return;
    done = true;
    try {
      handle?.destroy();
    } catch {
      /* */
    }
    root.remove();
    onExit();
  };
  try {
    handle = await def.launch(root, exit);
    if (done) handle.destroy();
  } catch {
    root.remove();
    return false;
  }
  return true;
}

/** Abre o jogo da rodada com a seed do campeonato. */
export async function playChampionshipRound(r: Omit<ChampRound, 'startedAt'>, onExit: () => void): Promise<boolean> {
  currentChampionshipRound = { ...r, startedAt: Date.now() };
  const ok = launcher ? await launcher(r.game, { seed: r.seed, onExit }) : await defaultLaunch(r.game, onExit);
  if (!ok) currentChampionshipRound = null;
  return ok;
}

export interface ChampScoreResult {
  ok: boolean;
  best?: number;
  attempts?: number;
  maxAttempts?: number;
  error?: string;
  message?: string;
  score: number;
  champId: string;
}

let installed = false;
/** Liga o ouvinte de 'run-end' (chamado por registerSocial). */
export function installChampionshipListener(): void {
  if (installed) return;
  installed = true;
  bus.on('run-end', async (rep: RunReport) => {
    const cur = currentChampionshipRound;
    if (!cur || rep.game !== cur.game) return;
    currentChampionshipRound = null;
    const pid = getPlayer()?.id ?? '';
    const duration = Math.max(rep.durationSec || 0, (Date.now() - cur.startedAt) / 1000 - 5);
    let res: ChampScoreResult;
    try {
      const r = await api<{ ok: boolean; best: number; attempts: number; maxAttempts: number }>('/champ/score', {
        id: cur.champId,
        pid,
        round: cur.round,
        score: Math.max(0, Math.floor(rep.score)),
        duration: Math.round(Math.min(duration, rep.durationSec || duration)),
      });
      res = { ...r, score: rep.score, champId: cur.champId };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      res = { ok: false, error: err.code, message: err.message, score: rep.score, champId: cur.champId };
    }
    bus.emit('champ-score', res);
  });
}
