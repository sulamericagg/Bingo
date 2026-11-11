/* Código de sala do Garimpo Bruto vindo de link/QR (?garimpo=K7Q2M): o jogo entra direto nela ao abrir. */
let pending = '';
export function setPendingGarimpo(code: string): void {
  pending = code;
}
export function takePendingGarimpo(): string {
  const c = pending;
  pending = '';
  return c;
}
