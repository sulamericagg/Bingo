/* ============================================================
 *  CONSERTOS — sons sintetizados (WebAudio, sem arquivos): catraca, porca caindo na
 *  bandeja, parafusadeira, faísca, encaixe, macaco, alarme do freio, ar comprimido.
 *  Usa a saída de efeitos do jogo (respeita "Som"). Buffer de ruído criado uma vez.
 * ============================================================ */
import { audio } from '../../../core/audio';

let noiseBuf: AudioBuffer | null = null;
function out(): { ctx: AudioContext; out: AudioNode } | null {
  const o = audio.fxOut();
  if (!o) return null;
  if (!noiseBuf || noiseBuf.sampleRate !== o.ctx.sampleRate) {
    const n = Math.floor(o.ctx.sampleRate * 1.2);
    noiseBuf = o.ctx.createBuffer(1, n, o.ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return o;
}
function tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0, attack = 0.004): void {
  const o = out();
  if (!o) return;
  const t = o.ctx.currentTime + delay;
  const os = o.ctx.createOscillator();
  os.type = type;
  os.frequency.setValueAtTime(f, t);
  if (slide !== 1) os.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  const g = o.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  os.connect(g).connect(o.out);
  os.start(t);
  os.stop(t + dur + 0.02);
}
function noise(dur: number, vol: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass', slide = 1): void {
  const o = out();
  if (!o || !noiseBuf) return;
  const t = o.ctx.currentTime + delay;
  const s = o.ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = o.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.Q.value = q;
  const g = o.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(o.out);
  s.start(t, Math.random() * 0.6);
  s.stop(t + dur + 0.02);
}
/** sino metálico: parciais inarmônicos curtos */
function ping(f: number, vol: number, delay = 0, dur = 0.35): void {
  tone(f, dur, 'sine', vol, 1, delay);
  tone(f * 2.76, dur * 0.6, 'sine', vol * 0.45, 1, delay);
  tone(f * 5.4, dur * 0.35, 'sine', vol * 0.2, 1, delay);
}

let lastRatchet = 0;
export const rs = {
  /** clique de catraca (chamado a cada ~25° de giro) */
  ratchet(pitch = 1): void {
    const now = performance.now();
    if (now - lastRatchet < 35) return;
    lastRatchet = now;
    noise(0.03, 0.22, 3800 * pitch, 6);
    tone(1900 * pitch, 0.02, 'square', 0.035, 0.7);
  },
  /** porca solta (pula da rosca) */
  pop(): void {
    tone(700, 0.08, 'triangle', 0.14, 1.8);
    noise(0.05, 0.2, 2500, 3);
  },
  /** porca batendo na bandeja de metal (quicando) */
  clink(k = 1): void {
    ping(1850 + Math.random() * 300, 0.09 * k);
    ping(2400 + Math.random() * 200, 0.05 * k, 0.07, 0.2);
  },
  /** parafusadeira pneumática: brrrt */
  impact(dur = 0.45): void {
    const o = out();
    if (!o) return;
    for (let i = 0; i < dur / 0.045; i++) {
      noise(0.035, 0.16, 1400 + i * 30, 4, i * 0.045);
      tone(150 + i * 4, 0.03, 'square', 0.05, 0.8, i * 0.045);
    }
    tone(380, dur, 'sawtooth', 0.04, 1.6);
  },
  /** encaixe firme (clack) */
  snap(): void {
    tone(260, 0.07, 'square', 0.12, 0.6);
    noise(0.05, 0.3, 1600, 2);
    ping(1300, 0.06, 0.02, 0.2);
  },
  /** faísca elétrica (fio no lugar errado) */
  zap(): void {
    noise(0.22, 0.28, 5200, 1.2, 0, 'highpass');
    tone(120, 0.2, 'sawtooth', 0.12, 1);
    for (let i = 0; i < 5; i++) noise(0.025, 0.25, 6000, 3, 0.03 + Math.random() * 0.15);
  },
  /** zumbido de "não" */
  nope(): void {
    tone(220, 0.16, 'square', 0.08, 0.8);
    tone(180, 0.2, 'square', 0.08, 0.8, 0.13);
  },
  /** bomba do macaco (subindo um dente) */
  jack(up = true): void {
    noise(0.08, 0.25, up ? 700 : 500, 3);
    tone(up ? 140 : 110, 0.1, 'triangle', 0.18, up ? 1.25 : 0.8);
    tone(2600, 0.02, 'square', 0.03, 1, 0.07);
  },
  /** válvula aberta: carro descendo (ar/óleo chiando) */
  hiss(dur = 1.2): void {
    noise(dur, 0.18, 2600, 0.7, 0, 'bandpass', 0.5);
  },
  /** pneu rolando no chão */
  roll(): void {
    noise(0.5, 0.12, 300, 0.8, 0, 'lowpass');
  },
  /** pneu/peça pesada caindo */
  thud(): void {
    tone(80, 0.25, 'sine', 0.35, 0.6);
    noise(0.15, 0.25, 220, 1, 0, 'lowpass');
  },
  /** arrastar metal */
  slide(): void {
    noise(0.25, 0.08, 1800, 2, 0, 'bandpass', 0.6);
  },
  /** borracha espremida (bucha entrando) */
  squish(): void {
    tone(320, 0.18, 'sine', 0.12, 0.55);
    noise(0.14, 0.1, 900, 2, 0.02);
  },
  /** mola balançando (teste da suspensão) */
  boing(): void {
    tone(180, 0.5, 'sine', 0.18, 1.5);
    tone(140, 0.4, 'triangle', 0.08, 1.3, 0.1);
  },
  /** bolha de ar saindo na sangria */
  bubble(): void {
    tone(500 + Math.random() * 400, 0.06, 'sine', 0.08, 2.2);
  },
  /** líquido escorrendo */
  pour(dur = 0.3): void {
    noise(dur, 0.06, 1100, 1.5, 0, 'bandpass', 1.3);
  },
  /** motor pegando (teste) */
  start(): void {
    for (let i = 0; i < 6; i++) tone(70 + i * 6, 0.09, 'sawtooth', 0.09, 1.1, i * 0.08);
    tone(90, 0.9, 'sawtooth', 0.08, 1.6, 0.5, 0.05);
    noise(0.9, 0.08, 400, 0.8, 0.5, 'lowpass');
  },
  /** porta do painel abrindo/fechando */
  door(open = true): void {
    tone(open ? 300 : 200, 0.12, 'triangle', 0.08, open ? 1.6 : 0.7);
    noise(0.1, 0.15, 900, 1.5, open ? 0 : 0.08);
    if (!open) tone(150, 0.08, 'square', 0.12, 0.5, 0.1);
  },
  /** comemoração: arpejo brilhante */
  cheer(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 1, i * 0.075));
    [1568, 2093, 2637].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, 1, 0.38 + i * 0.06));
  },
  /** estrela de bônus */
  star(): void {
    [1319, 1760, 2349].forEach((f, i) => ping(f, 0.06, i * 0.06, 0.4));
  },
  /** toque leve em botão do minijogo */
  tick(): void {
    tone(1100, 0.04, 'triangle', 0.07, 1.3);
  },
  /** alarme do freio (bip duplo agudo) */
  alarm(): void {
    tone(1480, 0.12, 'square', 0.09, 1);
    tone(1480, 0.12, 'square', 0.09, 1, 0.18);
  },
  /** freio-motor / freio de escape: "brrrap" grave */
  jake(): void {
    for (let i = 0; i < 8; i++) tone(65 + (i % 2) * 8, 0.05, 'square', 0.1, 0.9, i * 0.05);
    noise(0.4, 0.12, 300, 0.8, 0, 'lowpass');
  },
  /** troca de marcha (clonk) */
  shift(): void {
    tone(180, 0.06, 'square', 0.1, 0.7);
    noise(0.05, 0.2, 900, 2, 0.02);
  },
  /** pneu estourando / quebra */
  bang(): void {
    noise(0.35, 0.5, 800, 0.6, 0, 'lowpass', 0.4);
    tone(60, 0.3, 'sine', 0.4, 0.5);
  },
  /** cascalho da rampa de escape */
  gravel(): void {
    noise(0.3, 0.2, 2400, 0.6, 0, 'bandpass', 0.7);
  },
};
