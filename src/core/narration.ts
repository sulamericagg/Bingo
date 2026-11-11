/* Narração ("ler em voz alta" botões, dicas e eventos) para crianças que ainda não leem.
 * DESLIGADA por padrão — liga em Configurações. Não afeta o bichinho falante nem a dublagem. */
const KEY = 'bw-narration';
let on = false;
try {
  on = localStorage.getItem(KEY) === '1';
} catch {
  /* */
}
const subs = new Set<(v: boolean) => void>();
export const narrationOn = (): boolean => on;
export function setNarration(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* */
  }
  if (!v) {
    try {
      globalThis.speechSynthesis?.cancel();
    } catch {
      /* */
    }
  }
  subs.forEach((f) => f(v));
}
export function onNarration(f: (v: boolean) => void): void {
  subs.add(f);
}
