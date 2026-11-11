/* ============================================================
 *  BLOOP AUDIO — música procedural adaptativa.
 *
 *  Um TEMA (themes.ts) = andamento, tônica, modo, progressão de acordes,
 *  semente e PARTES (pad, baixo, arpejo, melodia, contracanto, sinos,
 *  acordes, percussão). Cada parte tem um ganho por ESTADO
 *  ('calm' | 'tension' | 'victory'); music.setState() faz a transição
 *  suave entre camadas sem cortar o compasso.
 *
 *  A melodia é composta UMA vez por tema (frase de N compassos: A A' A B,
 *  notas do acorde nos tempos fortes, graus da escala no resto) e repete
 *  em loop sem emenda. Tudo é agendado com antecipação no relógio do
 *  WebAudio (lookahead), então custa pouca CPU e não depende do frame rate.
 *  O MESMO código renderiza offline (OfflineAudioContext) para testes/WAV.
 * ============================================================ */
import { rng, type Ctx } from '../dsp';
import { isDrum, mtof, playDrum, playInst, type DrumId, type InstId, type NoteOut } from './inst';

export type MState = 'calm' | 'tension' | 'victory';
export type Role = 'pad' | 'bass' | 'arp' | 'lead' | 'counter' | 'bell' | 'chord' | 'perc' | 'drone';

export interface Part {
  role: Role;
  /** instrumento (ou peça de bateria, para role 'perc') */
  inst: InstId | DrumId;
  /** volume da parte (linear) */
  vol: number;
  /** oitava relativa à tônica do tema */
  oct?: number;
  /** ritmo em 16 passos ('x' toca, 'X' acento, 'o' quinta (baixo), 'h' oitava (baixo), '.' pausa). Várias barras: separe com '|' */
  pat?: string;
  /** ganho por estado (ausente = 0, desligada) */
  st: Partial<Record<MState, number>>;
  /** melodia: densidade 0..1 */
  dens?: number;
  /** arpejo: ordem das notas do acorde */
  order?: number[];
  /** envio de reverb */
  wet?: number;
  /** duração da nota em passos (padrão: até o próximo toque) */
  len?: number;
}

export interface Theme {
  id: string;
  name: string;
  bpm: number;
  /** tônica (MIDI) */
  root: number;
  /** escala (semitons) */
  mode: number[];
  /** graus por compasso (0 = I) */
  prog: number[];
  /** acordes com sétima */
  sev?: boolean;
  /** swing 0..0.35 (atrasa os 16 avos pares) */
  swing?: number;
  seed: number;
  /** compassos da frase da melodia (padrão = 2× progressão, mínimo 4) */
  phrase?: number;
  parts: Part[];
  /** ajuste final (dB) depois da medição */
  db?: number;
  /** instrumento das vinhetas (padrão: o da melodia) */
  sting?: InstId;
  /** fórmula 3/4 (12 passos por compasso) */
  waltz?: boolean;
}

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harm: [0, 2, 3, 5, 7, 8, 11],
  pentaMaj: [0, 2, 4, 7, 9, 12, 14],
  pentaMin: [0, 3, 5, 7, 10, 12, 15],
};

/** nota MIDI do grau `d` (pode passar de 7) */
export function degree(th: Theme, d: number): number {
  const n = th.mode.length;
  const o = Math.floor(d / n);
  const i = ((d % n) + n) % n;
  return th.root + th.mode[i] + 12 * o;
}
export function chordOf(th: Theme, deg: number): number[] {
  const c = [deg, deg + 2, deg + 4];
  if (th.sev) c.push(deg + 6);
  return c.map((d) => degree(th, d));
}

interface MelNote {
  step: number;
  len: number;
  midi: number;
  vel: number;
}

/** compõe a frase da melodia (determinística pela semente do tema) */
export function composeMelody(th: Theme, dens: number, octave: number, seedOff = 0, below = false): MelNote[][] {
  const steps = th.waltz ? 12 : 16;
  const bars = th.phrase ?? Math.max(4, th.prog.length * 2);
  const r = rng(th.seed * 31 + seedOff);
  // motivo rítmico de 1 compasso (tempo 1 sempre; o resto pela densidade)
  const mkRhythm = (d: number) => {
    const on: number[] = [0];
    for (let s = 1; s < steps; s++) {
      const strong = s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.3 : 0.12;
      if (r() < strong * d * 1.6) on.push(s);
    }
    return on;
  };
  const A = mkRhythm(dens);
  const B = mkRhythm(dens * 0.8);
  const contour = A.map(() => Math.floor(r() * 5) - 2);
  const contourB = B.map(() => Math.floor(r() * 5) - 2);
  const out: MelNote[][] = [];
  let pos = 2 + Math.floor(r() * 3); // grau atual (relativo à tônica, em graus)
  for (let b = 0; b < bars; b++) {
    const deg = th.prog[b % th.prog.length];
    const last = b === bars - 1;
    const useB = b % 4 === 3;
    const rhy = last ? [0, 4, 8].filter((s) => s < steps) : useB ? B : A;
    const con = useB ? contourB : contour;
    const notes: MelNote[] = [];
    rhy.forEach((s, i) => {
      if (last && i === rhy.length - 1) {
        pos = 7 * Math.round(pos / 7); // cadência: termina na tônica
      } else {
        const dir = con[i % con.length] + (b % 2 === 1 && i === rhy.length - 1 ? (r() < 0.5 ? 1 : -1) : 0);
        pos += dir;
        if (pos > 9) pos -= 3;
        if (pos < -2) pos += 3;
        // tempo forte: puxa para nota do acorde
        if (s % 4 === 0) {
          const ct = [deg, deg + 2, deg + 4, deg + 7, deg - 3];
          let best = ct[0];
          for (const x of ct) if (Math.abs(x - pos) < Math.abs(best - pos)) best = x;
          pos = best;
        }
      }
      const next = rhy[i + 1] ?? steps;
      const len = Math.max(1, Math.min(next - s, last && i === rhy.length - 1 ? steps - s : 6));
      notes.push({ step: s, len, midi: degree(th, pos + (below ? -2 : 0)) + 12 * octave, vel: s % 4 === 0 ? 1 : 0.8 });
    });
    out.push(notes);
  }
  return out;
}

/* ============================== deck (um tema tocando) ============================== */
export class Deck {
  readonly th: Theme;
  private o: NoteOut;
  private gains: GainNode[] = [];
  private level: number[] = [];
  readonly out: GainNode;
  private mel = new Map<number, MelNote[][]>();
  step = 0;
  nextT = 0;
  state: MState = 'calm';
  private readonly stepsPerBar: number;
  constructor(th: Theme, c: Ctx, dest: AudioNode, rev: AudioNode, t0: number) {
    this.th = th;
    this.stepsPerBar = th.waltz ? 12 : 16;
    this.out = c.createGain();
    this.out.gain.value = Math.pow(10, (th.db ?? 0) / 20);
    this.out.connect(dest);
    const revIn = c.createGain();
    revIn.connect(rev);
    this.o = { c, out: this.out, rev: revIn, wet: 0.25 };
    th.parts.forEach((p, i) => {
      const g = c.createGain();
      const v = (p.st.calm ?? 0) * p.vol;
      g.gain.value = v;
      this.level[i] = v;
      g.connect(this.out);
      this.gains.push(g);
      if (p.role === 'lead' || p.role === 'counter') this.mel.set(i, composeMelody(th, p.dens ?? 0.5, p.oct ?? 0, i * 17, p.role === 'counter'));
    });
    this.nextT = t0;
  }
  get stepDur(): number {
    return 60 / this.th.bpm / 4;
  }
  /** muda o estado: as camadas sobem/descem em ~tc*3 s */
  setState(s: MState, at: number, tc = 0.5): void {
    this.state = s;
    this.th.parts.forEach((p, i) => {
      const v = (p.st[s] ?? 0) * p.vol;
      this.level[i] = v;
      this.gains[i].gain.setTargetAtTime(v, at, tc);
    });
  }
  /** agenda todos os passos até `until` */
  schedule(until: number): void {
    while (this.nextT < until) {
      this.playStep(this.step, this.nextT);
      this.nextT += this.stepDur;
      this.step++;
    }
  }
  private playStep(step: number, t: number): void {
    const th = this.th;
    const spb = this.stepsPerBar;
    const bar = Math.floor(step / spb);
    const s = step % spb;
    const deg = th.prog[bar % th.prog.length];
    const chord = chordOf(th, deg);
    const sd = this.stepDur;
    const swingT = s % 2 === 1 ? (th.swing ?? 0) * sd : 0;
    const tt = t + swingT;
    const c = this.o.c;
    th.parts.forEach((p, i) => {
      if (this.level[i] <= 0.0005 && this.gains[i].gain.value < 0.002) return; // camada desligada: não gasta CPU
      const o: NoteOut = { c, out: this.gains[i], rev: this.o.rev, wet: p.wet ?? 0.22 };
      const oct = 12 * (p.oct ?? 0);
      const pats = p.pat ? p.pat.split('|') : null;
      const pat = pats ? pats[bar % pats.length] : null;
      const ch = pat ? pat[s % pat.length] : '.';
      const hit = ch !== '.' && ch !== '-' && ch !== undefined;
      const acc = ch === 'X' ? 1 : 0.78;
      const hum = 0.92 + Math.random() * 0.1;
      const nextHit = () => {
        if (!pat) return spb;
        for (let k = 1; k <= spb; k++) {
          const x = pat[(s + k) % pat.length];
          if (x !== '.' && x !== '-') return k;
          if (x === '.' && pat[(s + k - 1) % pat.length] !== '-') return k;
        }
        return spb;
      };
      switch (p.role) {
        case 'pad':
        case 'drone': {
          const every = p.len ?? spb;
          if (step % every !== 0) return;
          const notes = p.role === 'drone' ? [th.root, th.root + 7] : chord;
          for (const m of notes) playInst(p.inst as InstId, o, t, mtof(m + oct), every * sd * 0.98, 0.9);
          return;
        }
        case 'bass': {
          if (!hit) return;
          const m = (ch === 'o' ? chord[2] : ch === 'h' ? chord[0] + 12 : chord[0]) - 12 + oct;
          playInst(p.inst as InstId, o, tt, mtof(m), Math.min(p.len ?? 99, nextHit()) * sd * 0.9, acc * hum);
          return;
        }
        case 'chord': {
          if (!hit) return;
          for (const m of chord) playInst(p.inst as InstId, o, tt, mtof(m + oct), (p.len ?? 2) * sd, acc * hum * 0.7);
          return;
        }
        case 'arp': {
          if (!hit) return;
          const order = p.order ?? [0, 1, 2, 1];
          let n = 0;
          for (let k = 0; k < s; k++) if (pat && pat[k % pat.length] !== '.' && pat[k % pat.length] !== '-') n++;
          const idx = order[n % order.length];
          const m = chord[idx % chord.length] + 12 * Math.floor(idx / chord.length);
          playInst(p.inst as InstId, o, tt, mtof(m + oct), (p.len ?? 2) * sd, acc * hum);
          return;
        }
        case 'bell': {
          // sininho ocasional (1º tempo de compassos pares, nota do acorde no alto)
          const every = p.len ?? 2;
          if (s !== 0 || bar % every !== 0) return;
          const m = chord[(bar / every) % chord.length | 0];
          playInst(p.inst as InstId, o, t, mtof(m + oct), sd * 6, 0.8);
          return;
        }
        case 'lead':
        case 'counter': {
          const mel = this.mel.get(i)!;
          const notes = mel[bar % mel.length];
          for (const nn of notes)
            if (nn.step === s) {
              const lenSteps = p.len ? Math.min(p.len, nn.len) : nn.len;
              playInst(p.inst as InstId, o, tt, mtof(nn.midi + (p.role === 'counter' ? -12 : 0)), lenSteps * sd * 0.92, nn.vel * hum);
            }
          return;
        }
        case 'perc': {
          if (!hit || !isDrum(p.inst)) return;
          playDrum(p.inst, o, tt + (Math.random() - 0.5) * 0.004, acc * hum);
          return;
        }
      }
    });
  }
  fadeOut(at: number, sec: number): void {
    this.out.gain.setTargetAtTime(0, at, sec / 3);
  }
  fadeIn(at: number, sec: number): void {
    const v = this.out.gain.value;
    this.out.gain.setValueAtTime(0, at);
    this.out.gain.linearRampToValueAtTime(v, at + sec);
  }
}

/* ============================== vinhetas (stingers) ============================== */
export type StingId = 'win' | 'lose' | 'levelup' | 'item' | 'start' | 'title';

export function playSting(th: Theme, kind: StingId, c: Ctx, dest: AudioNode, rev: AudioNode, t: number): number {
  const lead = th.sting ?? (th.parts.find((p) => p.role === 'lead')?.inst as InstId | undefined) ?? 'marimba';
  const o: NoteOut = { c, out: dest, rev, wet: 0.3 };
  const d = (x: number) => degree(th, x) + 12;
  const sd = Math.min(0.11, 60 / th.bpm / 4);
  const hit = (inst: InstId, m: number, at: number, len: number, vel = 1) => playInst(inst, o, t + at, mtof(m), len, vel);
  switch (kind) {
    case 'win': {
      [0, 2, 4, 7].forEach((x, i) => hit(lead, d(x), i * sd * 2, sd * 2, 0.9));
      [0, 2, 4].forEach((x) => hit('padGlass', d(x + 7), sd * 8, 1.4, 1));
      hit(lead, d(7) + 0, sd * 8, 1.0, 1);
      playDrum('tri', o, t + sd * 8, 1);
      return sd * 8 + 1.4;
    }
    case 'levelup': {
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((x, i) => hit(lead, d(x), i * sd, sd * 1.2, 0.7 + i * 0.04));
      [0, 2, 4].forEach((x) => hit('bell', d(x + 7), sd * 8, 1.2, 0.8));
      return sd * 8 + 1.2;
    }
    case 'item': {
      [4, 7, 9].forEach((x, i) => hit('musicbox', d(x + 7), i * sd * 1.2, 0.6, 0.9));
      return 0.9;
    }
    case 'start': {
      [0, 4].forEach((x, i) => hit(lead, d(x), i * sd * 3, sd * 3, 0.9));
      hit(lead, d(7), sd * 6, sd * 6, 1);
      playDrum('kick', o, t, 0.8);
      playDrum('kick', o, t + sd * 6, 0.9);
      return sd * 12;
    }
    case 'title': {
      // cartão de título: arpejo que sobe, acorde de sinos e brilho de caixinha de música (o "glint")
      [0, 2, 4, 7, 9, 11].forEach((x, i) => hit(lead, d(x), i * sd * 1.5, sd * 3, 0.75 + i * 0.04));
      [0, 2, 4].forEach((x) => hit('bell', d(x + 7), sd * 9, 2.2, 0.85));
      [0, 2, 4].forEach((x) => hit('padGlass', d(x), sd * 9, 2.6, 0.9));
      [14, 16, 18, 21].forEach((x, i) => hit('musicbox', d(x), sd * 10 + i * sd * 0.8, 0.8, 0.7));
      playDrum('tri', o, t + sd * 9, 0.9);
      return sd * 9 + 2.6;
    }
    case 'lose': {
      // descida gentil (nada de "derrota" assustadora): 4 → 3 → 1, termina numa nota do acorde
      [4, 3, 1].forEach((x, i) => hit(lead, d(x), i * sd * 3, sd * 3, 0.7));
      [0, 2, 4].forEach((x) => hit('padGlass', d(x), sd * 9, 1.2, 0.8));
      return sd * 9 + 1.2;
    }
  }
}
