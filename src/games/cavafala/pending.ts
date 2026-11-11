/* Sala do Cava & Fala vinda de link/QR (?cava=K7Q2M) ou do grupo (party): o jogo entra direto nela ao abrir. */
export interface PendingCava {
  /** código de 5 letras (link/QR/convite) */
  code?: string;
  /** sala do grupo (party): todos do grupo chegam no mesmo código */
  party?: string;
  at?: number;
}
let pending: PendingCava | null = null;
export function setPendingCava(p: PendingCava): void {
  pending = { ...p, at: Date.now() };
}
/** pega (e limpa) o pedido, se ainda for recente */
export function takePendingCava(): PendingCava | null {
  const p = pending;
  pending = null;
  return p && Date.now() - (p.at ?? 0) < 60_000 ? p : null;
}
