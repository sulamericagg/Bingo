/* ============================================================
 *  PAPER — "Personagem 2D / 3D" nos jogos 3D.
 *  Opção global (Configurações; padrão = 2D) + chave por jogo para
 *  reverter um jogo sozinho sem mexer no resto.
 * ============================================================ */
const KEY = 'bw-paper-char';
let on = true;
try {
  on = localStorage.getItem(KEY) !== '0';
} catch {
  /* */
}
const subs = new Set<(v: boolean) => void>();

/** Chave por jogo: false = aquele jogo volta para o Bloop 3D (independe da opção). */
export const PAPER_GAMES: Record<string, boolean> = {
  noites: true,
  garimpo: true,
  floresta: true,
  disaster: true,
};

/** Opção global "Personagem 2D" (true = 2D, o padrão). */
export const paperPref = (): boolean => on;
export function setPaperPref(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* */
  }
  subs.forEach((f) => f(v));
}
export function onPaperPref(f: (v: boolean) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
/** O jogo `game` deve desenhar os Bloops como personagens de papel 2D? */
export const paperOn = (game: string): boolean => on && PAPER_GAMES[game] !== false;
