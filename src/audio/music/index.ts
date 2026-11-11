/* ============================================================
 *  BLOOP AUDIO — controle da música do app.
 *    music.play('noites')        troca de tema com crossfade (null = silêncio)
 *    music.setState('tension')   camadas adaptativas (calm/tension/victory)
 *    music.setIntensity(0..1)    atalho: >0.55 = tension
 *    music.sting('win')          vinheta no tom/timbre do tema atual (abaixa a música)
 *    music.pause()/resume()      ex.: tela de pausa do jogo
 * ============================================================ */
import { engine, makeImpulse } from '../engine';
import { Deck, playSting, type MState, type StingId, type Theme } from './player';
import { THEMES } from './themes';

const LOOKAHEAD = 0.25;
let deck: Deck | null = null;
const fading: { d: Deck; until: number }[] = [];
let timer = 0;
let wanted: string | null = null;
let state: MState = 'calm';
let revertTimer = 0;
let paused = false;
const stateCbs = new Set<(s: MState) => void>();

function tick(): void {
  const c = engine.ctx;
  if (!c || c.state !== 'running') return;
  const until = c.currentTime + LOOKAHEAD;
  if (deck && !paused) {
    // contexto ficou parado muito tempo (aba em segundo plano): não tenta "alcançar" o tempo perdido
    if (deck.nextT < c.currentTime - 0.3) deck.nextT = c.currentTime + 0.05;
    deck.schedule(until);
  }
  for (let i = fading.length - 1; i >= 0; i--) {
    const f = fading[i];
    if (c.currentTime > f.until) {
      f.d.out.disconnect();
      fading.splice(i, 1);
    } else f.d.schedule(until);
  }
  if (!deck && !fading.length) stopTimer();
}
function startTimer(): void {
  if (!timer) timer = window.setInterval(tick, 50);
}
function stopTimer(): void {
  clearInterval(timer);
  timer = 0;
}

export const music = {
  /** tema atual pedido (mesmo antes de o áudio destravar) */
  get theme(): string | null {
    return wanted;
  },
  get state(): MState {
    return state;
  },
  play(id: string | null, fade = 1.2): void {
    if (id && !THEMES[id]) id = null;
    if (id === wanted && (deck || !engine.ctx)) return;
    wanted = id;
    if (state !== 'calm') {
      state = 'calm';
      stateCbs.forEach((cb) => cb('calm'));
    }
    paused = false;
    const c = engine.ctx;
    if (!c) {
      engine.onReady(() => {
        if (wanted === id && !deck) {
          wanted = null;
          music.play(id, 0.6);
        }
      });
      return;
    }
    const t = c.currentTime + 0.05;
    if (deck) {
      deck.fadeOut(t, fade);
      fading.push({ d: deck, until: t + fade * 1.6 });
      deck = null;
    }
    if (!id) return;
    const th = THEMES[id];
    const d = new Deck(th, c, engine.musicIn, engine.musicRev, t + (fading.length ? fade * 0.4 : 0.05));
    d.fadeIn(t, fading.length ? fade : 0.6);
    deck = d;
    startTimer();
  },
  setState(s: MState, o: { bars?: number } = {}): void {
    clearTimeout(revertTimer);
    if (s !== state) {
      state = s;
      stateCbs.forEach((cb) => cb(s));
      const c = engine.ctx;
      if (deck && c) deck.setState(s, c.currentTime, s === 'tension' ? 0.35 : 0.6);
    }
    if (o.bars && deck) {
      const sec = (o.bars * 16 * deck.stepDur) | 0;
      revertTimer = window.setTimeout(() => music.setState('calm'), sec * 1000);
    }
  },
  /** avisa quando o estado muda (o ambiente usa para dia/noite) */
  onState(cb: (s: MState) => void): () => void {
    stateCbs.add(cb);
    return () => stateCbs.delete(cb);
  },
  setIntensity(v: number): void {
    if (state === 'victory') return;
    music.setState(v > 0.55 ? 'tension' : 'calm');
  },
  sting(kind: StingId): void {
    const c = engine.ctx;
    if (!c || c.state !== 'running') return;
    const th = THEMES[wanted ?? ''] ?? THEMES.hub;
    const dur = playSting(th, kind, c, engine.musicIn, engine.musicRev, c.currentTime + 0.03);
    engine.duck(0.6, dur * 0.8, 0.8);
  },
  pause(): void {
    paused = true;
    if (deck && engine.ctx) deck.out.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.15);
  },
  resume(): void {
    if (!paused) return;
    paused = false;
    if (deck && engine.ctx) {
      deck.nextT = engine.ctx.currentTime + 0.05;
      deck.out.gain.setTargetAtTime(Math.pow(10, (deck.th.db ?? 0) / 20), engine.ctx.currentTime, 0.3);
    }
  },
};

/* ============================== render offline (testes / WAV) ============================== */
/**
 * Renderiza `sec` segundos de um tema num OfflineAudioContext, com mudanças de estado
 * em instantes dados (ex.: [[0,'calm'],[16,'tension'],[32,'victory']]) e vinhetas.
 * A cadeia imita o barramento de música (reverb + ganho de referência).
 */
export async function renderTheme(
  id: string,
  sec: number,
  timeline: [number, MState][] = [[0, 'calm']],
  opts: { sr?: number; stings?: [number, StingId][]; gain?: number } = {},
): Promise<AudioBuffer> {
  const th: Theme = THEMES[id];
  const sr = opts.sr ?? 44100;
  const oc = new OfflineAudioContext(2, Math.ceil(sr * sec), sr);
  const bus = oc.createGain();
  bus.gain.value = opts.gain ?? 1;
  bus.connect(oc.destination);
  const rev = oc.createGain();
  const conv = oc.createConvolver();
  conv.buffer = makeImpulse(oc, 2.0, 2.6, 0.35);
  const wet = oc.createGain();
  wet.gain.value = 0.32;
  rev.connect(conv).connect(wet).connect(bus);
  const d = new Deck(th, oc, bus, rev, 0.02);
  const tl = [...timeline].sort((a, b) => a[0] - b[0]);
  // agenda em blocos (mesmo laço do tempo real), aplicando as mudanças de estado no caminho
  for (let t = 0; t < sec; t += LOOKAHEAD) {
    while (tl.length && tl[0][0] <= t + LOOKAHEAD) {
      const [at, s] = tl.shift()!;
      d.setState(s, Math.max(0.001, at), at <= 0 ? 0.01 : s === 'tension' ? 0.35 : 0.6);
    }
    d.schedule(Math.min(sec, t + LOOKAHEAD));
  }
  for (const [at, k] of opts.stings ?? []) playSting(th, k, oc, bus, rev, at);
  return oc.startRendering();
}
