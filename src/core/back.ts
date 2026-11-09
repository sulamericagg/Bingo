/**
 * Pilha do botão "voltar" (Android / Escape) para painéis em overlay
 * (Passe, Coleção, Social, Campeonatos, Ranking...). Quem abre um painel
 * chama pushBack(fechar) e guarda o "pop" devolvido; ao fechar por outro
 * caminho (X, clique fora), chama esse pop. ui.back() consulta a pilha primeiro.
 */
type Entry = { close: () => void };
const stack: Entry[] = [];

/** Registra um painel aberto. Devolve a função que o tira da pilha (idempotente). */
export function pushBack(close: () => void): () => void {
  const e: Entry = { close };
  stack.push(e);
  return () => {
    const i = stack.indexOf(e);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Fecha o painel do topo. true = tratou o voltar. */
export function popBack(): boolean {
  const e = stack.pop();
  if (!e) return false;
  try {
    e.close();
  } catch (err) {
    console.warn('[back]', err);
  }
  return true;
}
