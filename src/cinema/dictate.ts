/* ============================================================
 *  BLOOP CINEMA — DITADO: fala → texto na caixa (historinha, ideia).
 *
 *  Por cima de pet/talk/stt.ts (Android: reconhecedor nativo com
 *  parciais, permissão pedida antes; web: Web Speech API):
 *   - texto ao vivo (parciais) direto na caixa;
 *   - nível do microfone: web = AnalyserNode real (exceto Android web,
 *     onde abrir o microfone duas vezes derruba o reconhecedor);
 *     nativo = pulsa com a chegada dos parciais;
 *   - NUNCA trava: tempo máximo (20 s), silêncio (sem novidade por 2,5 s
 *     depois de falar, ou 8 s sem nada) e um vigia que encerra se o
 *     reconhecedor não responder ao "parar";
 *   - sem reconhecedor: avisa e devolve o foco ao teclado.
 *  O áudio vai para o reconhecedor do sistema; nada é gravado.
 * ============================================================ */
import { isNative } from '../core/platform';
import { cancelListening, listen, stopListening, sttAvailable, type SttError } from '../pet/talk/stt';

export type DictateResult = { text: string } | { error: SttError | 'busy' };

export interface DictateOpts {
  /** texto parcial enquanto a criança fala */
  onText: (s: string) => void;
  /** nível 0..1 (~30 vezes por segundo) */
  onLevel?: (v: number) => void;
  maxMs?: number;
}

let running: { stop: () => void } | null = null;

export const dictating = (): boolean => !!running;
/** Para o ditado em andamento (o texto ouvido até aqui é entregue). */
export function stopDictation(): void {
  running?.stop();
}
export { sttAvailable as dictationAvailable };

export async function dictate(o: DictateOpts): Promise<DictateResult> {
  if (running) return { error: 'busy' };
  if (!(await sttAvailable())) return { error: 'unsupported' };
  const maxMs = o.maxMs ?? 20_000;
  let last = '';
  let lastChange = performance.now();
  const t0 = performance.now();
  let pulse = 0;
  let stopAsked = 0;
  let level: { stop: () => void; read: () => number } | null = null;
  let finished = false;
  let raf = 0;

  const stop = () => {
    if (stopAsked) return;
    stopAsked = performance.now();
    stopListening();
  };
  running = { stop };

  // nível real do microfone (web de computador)
  if (!isNative && !/Android/i.test(navigator.userAgent) && o.onLevel && navigator.mediaDevices?.getUserMedia) {
    void navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((ms) => {
        if (finished) return ms.getTracks().forEach((tr) => tr.stop());
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const c = new C();
        const an = c.createAnalyser();
        an.fftSize = 512;
        c.createMediaStreamSource(ms).connect(an);
        const buf = new Float32Array(an.fftSize);
        level = {
          read: () => {
            an.getFloatTimeDomainData(buf);
            let s = 0;
            for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
            return Math.min(1, Math.sqrt(s / buf.length) * 6);
          },
          stop: () => {
            ms.getTracks().forEach((tr) => tr.stop());
            void c.close().catch(() => {});
          },
        };
      })
      .catch(() => {});
  }

  const tick = () => {
    if (finished) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    pulse *= 0.9;
    o.onLevel?.(level ? level.read() : pulse * (0.75 + 0.25 * Math.sin(now / 60)));
    const quiet = now - lastChange;
    if (!stopAsked && (now - t0 > maxMs || (last ? quiet > 2500 : quiet > 8000))) stop();
    // vigia: o reconhecedor não respondeu ao "parar"
    if (stopAsked && now - stopAsked > 2500) cancelListening();
  };
  tick();

  const r = await Promise.race([
    listen({
      onPartial: (s) => {
        if (s !== last) {
          last = s;
          lastChange = performance.now();
          pulse = 1;
          o.onText(s);
        }
      },
    }),
    // segurança extra: nada passa de max + 6 s
    new Promise<DictateResult>((res) => setTimeout(() => res(last ? { text: last } : { error: 'nomatch' }), maxMs + 6000)),
  ]);
  finished = true;
  cancelAnimationFrame(raf);
  (level as { stop: () => void } | null)?.stop();
  o.onLevel?.(0);
  running = null;
  cancelListening(); // (já terminou = nada acontece)
  if ('error' in r && r.error === 'nomatch' && last) return { text: last };
  return r;
}
