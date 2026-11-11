/* ============================================================
 *  BLOOP AUDIO — efeitos: pacotes por jogo, cache pré-renderizado,
 *  limite de vozes, variação (variantes/tom/ganho) e som posicional.
 *
 *  Um PACOTE (Pack) é o "sotaque" sonoro de um jogo: nomes de som → receita.
 *  Os nomes "clássicos" (click, coin, hit… de core/audio e chop, thud, pop…
 *  de 3d/common/sfx) são resolvidos pelo pacote ATIVO e, se ele não tiver,
 *  pelo pacote 'base'. Assim cada jogo soa diferente sem mexer no código dele.
 *
 *  Cache: cada receita é renderizada (OfflineAudioContext) em N variantes na
 *  1ª vez (ou antes, quando o pacote é ativado) e normalizada para um nível
 *  de referência (loudness por janela de 300 ms) → volumes consistentes.
 * ============================================================ */
import { engine } from './engine';
import { hash, rng, type V } from './dsp';

export type Recipe = (v: V) => void;
export type BusId = 'sfx' | 'ui' | 'voice' | 'amb';

export interface SoundDef {
  r: Recipe;
  /** duração renderizada (s) — cauda incluída */
  dur: number;
  /** ajuste de nível relativo à referência (dB). Padrão 0. */
  db?: number;
  /** quantas variantes pré-renderizar (padrão 3; 1 = som fixo, ex. jingles) */
  variants?: number;
  /** variação de tom aleatória a cada toque (cents, ±). Padrão 35 */
  pitch?: number;
  /** variação de ganho (dB, ±). Padrão 1.5 */
  gj?: number;
  /** vozes simultâneas deste som (rouba a mais antiga). Padrão 4 */
  max?: number;
  /** abaixa a música (0..1) enquanto toca — use em sons importantes */
  duck?: number;
  bus?: BusId;
  /** envio de reverb 0..1 */
  rev?: number;
  /** intervalo mínimo entre toques (s). Padrão 0.025 */
  cool?: number;
  /** loop sem emenda (camas de ambiente, chiado contínuo) */
  loop?: boolean;
  /** estéreo (2 sementes L/R) — bom para ambientes */
  stereo?: boolean;
  /** não normaliza (usa o nível bruto da receita × db) */
  raw?: boolean;
}

export interface AmbLayer {
  /** nome do som (loop) no pacote */
  id: string;
  /** dB extra */
  db?: number;
  /** só toca nesses estados da música (ex.: Noites: grilos só à noite = 'tension') */
  when?: ('calm' | 'tension' | 'victory')[];
}
export interface AmbEvent {
  /** nomes de sons do pacote sorteados */
  ids: string[];
  /** intervalo aleatório entre eventos (s) */
  every: [number, number];
  db?: number;
  /** espalha no estéreo */
  pan?: number;
  when?: ('calm' | 'tension' | 'victory')[];
}

export interface MotorPreset {
  /** forma do ronco */
  kind: 'kart' | 'diesel' | 'prop' | 'jet' | 'electric';
  /** frequência base em marcha lenta (Hz) e no máximo */
  idle: number;
  top: number;
  /** volume (linear) */
  vol?: number;
}

export interface Pack {
  id: string;
  /** rótulo para a página de audição */
  name: string;
  /** tema musical (null = sem música do app: o jogo tem a própria) */
  theme?: string | null;
  sounds: Record<string, SoundDef>;
  amb?: { layers: AmbLayer[]; events?: AmbEvent[] };
  motor?: MotorPreset;
}

export interface PlayOpts {
  /** multiplica a velocidade (tom) — 1.06^n sobe um semitom por n */
  rate?: number;
  /** dB extra */
  db?: number;
  /** estéreo -1..1 */
  pan?: number;
  /** posição 3D (usa o ouvinte de engine.setListener) */
  pos?: [number, number, number];
  delay?: number;
  /** ignora o intervalo mínimo */
  force?: boolean;
  /** variante fixa */
  variant?: number;
}

export interface SoundHandle {
  stop(fade?: number): void;
  readonly src: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner?: PannerNode;
}

/** nível de referência (RMS da janela mais forte, dBFS) por barramento */
const REF_DB: Record<BusId, number> = { sfx: -20, ui: -25, voice: -19, amb: -26 };

const packs = new Map<string, Pack>();
let active = 'base';
const cache = new Map<string, AudioBuffer[]>();
const pending = new Map<string, Promise<AudioBuffer[] | null>>();
interface Live {
  key: string;
  src: AudioBufferSourceNode;
  g: GainNode;
  end: number;
}
const live: Live[] = [];
const lastAt = new Map<string, number>();
const MAX_TOTAL = 28;

export function definePack(p: Pack): Pack {
  packs.set(p.id, p);
  return p;
}
export const getPack = (id: string) => packs.get(id);
export const listPacks = () => [...packs.values()];
export const activePack = () => active;

/** resolve 'nome' (pacote ativo → base) ou 'pacote.nome' */
export function resolve(name: string): { key: string; def: SoundDef } | null {
  const dot = name.indexOf('.');
  if (dot > 0) {
    const p = packs.get(name.slice(0, dot));
    const d = p?.sounds[name.slice(dot + 1)];
    return d ? { key: name, def: d } : null;
  }
  const a = packs.get(active)?.sounds[name];
  if (a) return { key: `${active}.${name}`, def: a };
  const b = packs.get('base')?.sounds[name];
  return b ? { key: `base.${name}`, def: b } : null;
}

/* ----------------------------- renderização ----------------------------- */
const OAC: typeof OfflineAudioContext | undefined =
  typeof window !== 'undefined' ? window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext : undefined;

/** 'loudness' simples: maior RMS numa janela de 300 ms (todas as amostras de todos os canais) */
export function measure(buf: AudioBuffer): { peak: number; rms: number } {
  const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const n = buf.length;
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.3));
  let peak = 0;
  let best = 0;
  let acc = 0;
  const sq = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const d of ch) {
      const x = d[i];
      const a = Math.abs(x);
      if (a > peak) peak = a;
      s += x * x;
    }
    sq[i] = s / ch.length;
  }
  for (let i = 0; i < n; i++) {
    acc += sq[i];
    if (i >= win) acc -= sq[i - win];
    if (acc > best) best = acc;
  }
  return { peak, rms: Math.sqrt(best / Math.min(win, n)) };
}

const XF = 0.6; // s de cruzamento para loops

async function renderVariant(def: SoundDef, seed: number, sr: number): Promise<AudioBuffer> {
  const ext = def.loop ? XF : 0;
  const chans = def.stereo ? 2 : 1;
  const len = Math.max(64, Math.ceil((def.dur + ext) * sr));
  const oc = new OAC!(chans, len, sr);
  if (chans === 2) {
    const m = oc.createChannelMerger(2);
    m.connect(oc.destination);
    for (let c = 0; c < 2; c++) {
      const g = oc.createGain();
      g.connect(m, 0, c);
      def.r({ c: oc, out: g, t: 0.002, r: rng(seed * 7 + c * 1013), p: 0 });
    }
  } else def.r({ c: oc, out: oc.destination, t: 0.002, r: rng(seed), p: 0 });
  const buf = await oc.startRendering();
  if (!def.loop) return buf;
  // loop sem emenda: o fim (cauda) cruza com o começo
  const L = Math.ceil(def.dur * sr);
  const X = Math.min(Math.ceil(XF * sr), buf.length - L);
  const out = new AudioBuffer({ numberOfChannels: chans, length: L, sampleRate: sr });
  for (let c = 0; c < chans; c++) {
    const s = buf.getChannelData(c);
    const d = out.getChannelData(c);
    d.set(s.subarray(0, L));
    for (let i = 0; i < X; i++) {
      const k = i / X;
      d[i] = s[i] * Math.sin(k * Math.PI * 0.5) + s[L + i] * Math.cos(k * Math.PI * 0.5);
    }
  }
  return out;
}

function normalize(bufs: AudioBuffer[], def: SoundDef): void {
  let rms = 0;
  let peak = 0;
  for (const b of bufs) {
    const m = measure(b);
    rms = Math.max(rms, m.rms);
    peak = Math.max(peak, m.peak);
  }
  if (rms < 1e-6) return;
  const target = def.raw ? 1 : Math.pow(10, (REF_DB[def.bus ?? 'sfx'] + (def.db ?? 0)) / 20) / rms;
  let g = def.raw ? Math.pow(10, (def.db ?? 0) / 20) : target;
  if (peak * g > 0.89) g = 0.89 / peak; // -1 dBFS de teto
  for (const b of bufs)
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
}

/** renderiza (ou devolve do cache) as variantes de um som */
export function prepare(key: string, def: SoundDef, sr?: number): Promise<AudioBuffer[] | null> {
  const have = cache.get(key);
  if (have) return Promise.resolve(have);
  const p0 = pending.get(key);
  if (p0) return p0;
  if (!OAC) return Promise.resolve(null);
  const rate = sr ?? engine.ctx?.sampleRate ?? 44100;
  const n = Math.max(1, def.variants ?? (def.loop ? 1 : 3));
  const seed = hash(key);
  const p = Promise.all([...Array(n)].map((_, i) => renderVariant(def, seed + i * 101, rate)))
    .then((bufs) => {
      normalize(bufs, def);
      cache.set(key, bufs);
      pending.delete(key);
      return bufs;
    })
    .catch((e) => {
      console.warn('[audio] render', key, e);
      pending.delete(key);
      return null;
    });
  pending.set(key, p);
  return p;
}

/** pré-renderiza todos os sons de um pacote em segundo plano (poucos por vez) */
export async function preloadPack(id: string): Promise<void> {
  const p = packs.get(id);
  if (!p || !engine.ctx) return;
  const names = Object.keys(p.sounds);
  for (let i = 0; i < names.length; i += 4) {
    await Promise.all(names.slice(i, i + 4).map((n) => prepare(`${id}.${n}`, p.sounds[n])));
    await new Promise((r) => setTimeout(r, 0));
  }
}

export function setActivePack(id: string): void {
  active = packs.has(id) ? id : 'base';
  if (engine.ctx) void preloadPack(active);
}

/* ----------------------------- tocar ----------------------------- */
function busNode(b: BusId | undefined): AudioNode {
  switch (b) {
    case 'ui':
      return engine.uiIn;
    case 'voice':
      return engine.voiceIn;
    case 'amb':
      return engine.ambIn;
    default:
      return engine.sfxIn;
  }
}

function start(key: string, def: SoundDef, bufs: AudioBuffer[], o: PlayOpts, when: number): SoundHandle | null {
  const c = engine.ctx!;
  // limite de vozes deste som e do total: rouba a mais antiga (com fade curtinho)
  const mine = live.filter((l) => l.key === key);
  const max = def.max ?? 4;
  while (mine.length >= max) kill(mine.shift()!);
  while (live.length >= MAX_TOTAL) kill(live[0]);
  const src = c.createBufferSource();
  const vi = o.variant ?? Math.floor(Math.random() * bufs.length);
  src.buffer = bufs[vi % bufs.length];
  const cents = (Math.random() * 2 - 1) * (def.pitch ?? 35);
  src.playbackRate.value = (o.rate ?? 1) * Math.pow(2, cents / 1200);
  src.loop = !!def.loop;
  const g = c.createGain();
  const gj = (Math.random() * 2 - 1) * (def.gj ?? 1.5);
  const lin = Math.pow(10, (gj + (o.db ?? 0)) / 20);
  if (def.loop) {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(lin, when + 0.4);
  } else g.gain.value = lin;
  src.connect(g);
  let tail: AudioNode = g;
  let panner: PannerNode | undefined;
  if (o.pos) {
    panner = c.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 80;
    panner.rolloffFactor = 1.1;
    if (panner.positionX) {
      panner.positionX.value = o.pos[0];
      panner.positionY.value = o.pos[1];
      panner.positionZ.value = o.pos[2];
    } else (panner as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(...o.pos);
    tail.connect(panner);
    tail = panner;
  } else if (o.pan && c.createStereoPanner) {
    const sp = c.createStereoPanner();
    sp.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail.connect(sp);
    tail = sp;
  }
  tail.connect(busNode(def.bus));
  if (def.rev) {
    const s = c.createGain();
    s.gain.value = def.rev;
    tail.connect(s).connect(def.bus === 'voice' ? engine.voiceIn : engine.sfxRev);
  }
  src.start(when, def.loop ? Math.random() * (src.buffer!.duration * 0.9) : 0);
  const dur = src.buffer!.duration / src.playbackRate.value;
  const l: Live = { key, src, g, end: def.loop ? Infinity : when + dur };
  live.push(l);
  src.onended = () => {
    const i = live.indexOf(l);
    if (i >= 0) live.splice(i, 1);
    try {
      g.disconnect();
    } catch {
      /* */
    }
  };
  if (def.duck) engine.duck(def.duck, Math.min(1.2, dur * 0.6));
  return {
    src,
    gain: g,
    panner,
    stop(fade = 0.06) {
      kill(l, fade);
    },
  };
}

function kill(l: Live, fade = 0.03): void {
  const c = engine.ctx;
  const i = live.indexOf(l);
  if (i >= 0) live.splice(i, 1);
  if (!c) return;
  const t = c.currentTime;
  try {
    l.g.gain.cancelScheduledValues(t);
    l.g.gain.setValueAtTime(l.g.gain.value, t);
    l.g.gain.linearRampToValueAtTime(0, t + fade);
    l.src.stop(t + fade + 0.01);
  } catch {
    /* já parou */
  }
}

/**
 * Toca um som. `name` = 'nome' (pacote ativo, cai no base) ou 'pacote.nome'.
 * Devolve o controle se tocou já (do cache); se ainda está renderizando, toca
 * assim que ficar pronto (~ms) e devolve null.
 */
export function play(name: string, o: PlayOpts = {}): SoundHandle | null {
  const c = engine.ctx;
  if (!c || c.state !== 'running') return null;
  const res = resolve(name);
  if (!res) return null;
  const { key, def } = res;
  const now = c.currentTime;
  if (!o.force) {
    const la = lastAt.get(key) ?? -1;
    if (now - la < (def.cool ?? 0.025)) return null;
  }
  lastAt.set(key, now);
  const bufs = cache.get(key);
  if (bufs) return start(key, def, bufs, o, now + (o.delay ?? 0));
  const t0 = performance.now();
  void prepare(key, def).then((b) => {
    // pronto rápido o bastante? toca (atrasado no máx. 120 ms); senão descarta este toque
    if (b && engine.running && performance.now() - t0 < 120 + (o.delay ?? 0) * 1000) start(key, def, b, o, engine.ctx!.currentTime + Math.max(0, (o.delay ?? 0) - (performance.now() - t0) / 1000));
  });
  return null;
}

/** toca um loop (ambiente / chiado contínuo) — pare com handle.stop() */
export async function loop(name: string, o: PlayOpts = {}): Promise<SoundHandle | null> {
  const c = engine.ctx;
  const res = resolve(name);
  if (!c || !res) return null;
  const bufs = await prepare(res.key, res.def);
  if (!bufs || !engine.ctx) return null;
  return start(res.key, { ...res.def, loop: true }, bufs, o, engine.ctx.currentTime + 0.01);
}

/** todos os nomes de um pacote (página de audição) */
export function soundNames(packId: string): string[] {
  return Object.keys(packs.get(packId)?.sounds ?? {});
}

/** para a página de audição / testes: renderiza uma variante fora do app */
export async function renderSound(name: string, sr = 44100): Promise<AudioBuffer | null> {
  const res = resolve(name);
  if (!res || !OAC) return null;
  const v = await renderVariant(res.def, hash(res.key), sr);
  normalize([v], res.def);
  return v;
}
