/* ============================================================
 *  BLOOP AUDIO — ambiente (camas em loop + eventos aleatórios) e motores.
 *  O ambiente de um pacote liga sozinho quando o jogo abre (ver glue.ts)
 *  e desliga ao sair. Jogos podem trocar com ambience.start('pacote').
 * ============================================================ */
import { engine } from './engine';
import { getPack, loop, play, type AmbLayer, type MotorPreset, type SoundHandle } from './sound';
import { music } from './music';

let beds: { h: SoundHandle; l: AmbLayer }[] = [];
let timers: number[] = [];
let current: string | null = null;
let gen = 0;

export const ambience = {
  /** liga o ambiente do pacote (troca o atual com fade) */
  async start(packId: string): Promise<void> {
    if (current === packId) return;
    this.stop();
    const p = getPack(packId);
    if (!p?.amb) return;
    current = packId;
    const my = ++gen;
    for (const l of p.amb.layers) {
      const h = await loop(`${packId}.${l.id}`, { db: l.db ?? 0 });
      if (my !== gen) {
        h?.stop(0.3);
        return;
      }
      if (h) {
        beds.push({ h, l });
        if (l.when && !l.when.includes(music.state)) {
          h.gain.gain.cancelScheduledValues(0);
          h.gain.gain.setValueAtTime(0, 0);
        }
      }
    }
    for (const ev of p.amb.events ?? []) {
      const next = () => {
        const [a, b] = ev.every;
        const id = window.setTimeout(() => {
          if (my !== gen) return;
          if (engine.running && !document.hidden && (!ev.when || ev.when.includes(music.state))) {
            const n = ev.ids[Math.floor(Math.random() * ev.ids.length)];
            play(`${packId}.${n}`, { db: ev.db ?? 0, pan: ev.pan ? (Math.random() * 2 - 1) * ev.pan : 0 });
          }
          next();
        }, (a + Math.random() * (b - a)) * 1000);
        timers.push(id);
      };
      next();
    }
  },
  stop(fade = 0.8): void {
    gen++;
    current = null;
    for (const b of beds) b.h.stop(fade);
    beds = [];
    for (const t of timers) clearTimeout(t);
    timers = [];
  },
  get current(): string | null {
    return current;
  },
};

/* dia/noite (ou calma/tensão): camadas com `when` sobem/descem junto com o estado da música */
music.onState((s) => {
  const c = engine.ctx;
  if (!c) return;
  for (const b of beds) if (b.l.when) b.h.gain.gain.setTargetAtTime(b.l.when.includes(s) ? Math.pow(10, (b.l.db ?? 0) / 20) : 0, c.currentTime, 1.2);
});

/* ============================== motores ============================== */
/** ronco contínuo com RPM (kart, diesel, hélice, jato, elétrico) — tudo ao vivo e barato */
export class Motor {
  private nodes: AudioScheduledSourceNode[] = [];
  private f!: BiquadFilterNode;
  private g!: GainNode;
  private oscs: OscillatorNode[] = [];
  private nf?: BiquadFilterNode;
  private ng?: GainNode;
  constructor(private pre: MotorPreset) {
    const c = engine.ctx;
    if (!c) return;
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.f = c.createBiquadFilter();
    this.f.type = 'lowpass';
    this.f.Q.value = pre.kind === 'diesel' ? 3 : 1.2;
    this.f.connect(this.g).connect(engine.sfxIn);
    const mk = (type: OscillatorType, mult: number, vol: number) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = pre.idle * mult;
      const og = c.createGain();
      og.gain.value = vol;
      o.connect(og).connect(this.f);
      o.start();
      this.nodes.push(o);
      this.oscs.push(o);
    };
    switch (pre.kind) {
      case 'diesel':
        mk('sawtooth', 1, 0.6);
        mk('square', 0.5, 0.45);
        mk('triangle', 2.01, 0.25);
        break;
      case 'kart':
        mk('sawtooth', 1, 0.55);
        mk('square', 0.5, 0.3);
        break;
      case 'prop':
        mk('triangle', 1, 0.6);
        mk('sawtooth', 2, 0.18);
        break;
      case 'jet':
        mk('sine', 1, 0.25);
        break;
      case 'electric':
        mk('sine', 1, 0.5);
        mk('triangle', 1.5, 0.15);
        break;
    }
    if (pre.kind === 'jet' || pre.kind === 'diesel' || pre.kind === 'prop') {
      const s = c.createBufferSource();
      const len = c.sampleRate;
      const b = c.createBuffer(1, len, c.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
        d[i] = pre.kind === 'jet' ? Math.random() * 2 - 1 : last * 3;
      }
      s.buffer = b;
      s.loop = true;
      this.nf = c.createBiquadFilter();
      this.nf.type = 'bandpass';
      this.nf.frequency.value = pre.kind === 'jet' ? 900 : 220;
      this.nf.Q.value = 0.7;
      this.ng = c.createGain();
      this.ng.gain.value = pre.kind === 'jet' ? 0.35 : 0.5;
      s.connect(this.nf).connect(this.ng).connect(this.g);
      s.start();
      this.nodes.push(s);
    }
    this.set(0, 0);
  }
  /** throttle 0..1 (acelerador), speed 0..1 */
  set(throttle: number, speed: number): void {
    const c = engine.ctx;
    if (!c || !this.g) return;
    const t = c.currentTime;
    const p = this.pre;
    const rpm = Math.min(1, 0.2 + speed * 0.6 + throttle * 0.3);
    const base = p.idle + (p.top - p.idle) * rpm;
    const mults = p.kind === 'diesel' ? [1, 0.5, 2.01] : p.kind === 'kart' ? [1, 0.5] : p.kind === 'prop' ? [1, 2] : p.kind === 'electric' ? [1, 1.5] : [1];
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(base * mults[i], t, 0.07));
    const cut = p.kind === 'electric' ? 1200 + rpm * 2400 : p.kind === 'jet' ? 600 + rpm * 900 : 220 + rpm * 1100 + throttle * 300;
    this.f.frequency.setTargetAtTime(cut, t, 0.06);
    if (this.nf) this.nf.frequency.setTargetAtTime(p.kind === 'jet' ? 500 + rpm * 1800 : 160 + rpm * 400, t, 0.1);
    const v = (p.vol ?? 0.09) * (0.55 + throttle * 0.45);
    this.g.gain.setTargetAtTime(v, t, 0.08);
  }
  stop(): void {
    const c = engine.ctx;
    if (!c || !this.g) return;
    const t = c.currentTime;
    this.g.gain.setTargetAtTime(0, t, 0.06);
    for (const n of this.nodes)
      try {
        n.stop(t + 0.4);
      } catch {
        /* */
      }
    this.nodes = [];
  }
}
