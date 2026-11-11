/* Código de sala do "Pouso Forçado" vindo de link/QR (?voo=K7Q2M): o jogo entra direto nela ao abrir. */
let pending = '';
export function setPendingVoo(code: string): void {
  pending = code;
}
export function takePendingVoo(): string {
  const c = pending;
  pending = '';
  return c;
}
