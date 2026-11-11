/* ============================================================
 *  QUALIDADE GRÁFICA AUTOMÁTICA
 *  - detectInitialTier(): palpite inicial (hardware + micro-benchmark), em cache
 *  - QualityGovernor: ajusta o nível em tempo real pelos tempos de frame
 *  - FpsLimiter: limite de 30 fps dentro de um laço rAF
 *  Integração com o jogo: ver docs/QUALIDADE.md
 * ============================================================ */
import { bus } from './events';
import { natureQ } from '../3d/nature/quality';

/** 0 = Mínimo ("batata"), 1 = Baixo, 2 = Médio, 3 = Alto */
export type Tier = 0 | 1 | 2 | 3;
export type QualityMode = 'auto' | Tier;

export interface QualitySettings {
  /** teto do devicePixelRatio do canvas */
  dprCap: number;
  /** 0..1 — fração de partículas emitidas (Particles.budget) */
  particleBudget: number;
  nebula: boolean;
  farPlanet: boolean;
  starLayers: 1 | 2 | 3;
  /** brilhos aditivos (glow) de moedas, power-ups, asteroides e herói */
  glows: boolean;
  /** atmosferas dos planetas com 'lighter' (false = versão barata, sem aditivo) */
  atmospheres: boolean;
  vignette: boolean;
  shake: boolean;
  fpsCap: 30 | 60;
  /** 0..1 — densidade dos rastros (multiplica o budget durante o voo) */
  trailDensity: number;
  /**
   * Personagem em cache: 0 = desenha o vetor todo frame; n = redesenha o bitmap do
   * personagem a cada n frames (posição, giro e squash continuam a cada frame).
   */
  heroCache: number;
  /** pós-processo de bloom (cópia reduzida + blur, somada com 'lighter') — só Alto */
  bloom: boolean;
  /** luzes dinâmicas aditivas (lâmpadas, lava, faróis, estrelas iluminando o cenário) */
  dynLights: boolean;
  /** sombras de contato suaves (sprite borrado em cache) em vez de elipse chapada */
  softShadows: boolean;
  /** partículas de ambiente (poeira, brasas, pólen) */
  ambientParticles: boolean;
  /** gradação de cor / raios de luz / reflexos especulares extras */
  grade: boolean;

  /* ---- modos 3D (three.js) — mesma régua de src/3d/common/quality.ts (q3For) e src/3d/nature/quality.ts ---- */
  /** teto do pixel ratio do WebGLRenderer (q3For.pr = min(dpr, pr3d)) */
  pr3d: number;
  /** sombras em tempo real (shadow map) */
  shadows: boolean;
  /** lado do shadow map (0 = sem sombras) */
  shadowMapSize: 0 | 512 | 1024 | 2048;
  /** grama de lâminas: lâminas/m² perto da câmera (0 = só a textura do chão) — igual a natureQ(tier) */
  grassDensity: number;
  /** grama de lâminas: distância (m) onde termina — igual a natureQ(tier) */
  grassDist: number;
  /** multiplicador da distância de visão / neblina / LOD (1 = cheia) */
  viewDist: number;
  /** MSAA no contexto WebGL (só vale ao criar o renderer) */
  antialias: boolean;
  /** pós-processo 3D (bloom, gradação de cor) */
  post: boolean;
}

export const TIER_LABELS: Record<Tier, string> = { 0: 'Mínimo', 1: 'Baixo', 2: 'Médio', 3: 'Alto' };
export const MAX_TIER: Tier = 3;

type Settings2D = Omit<QualitySettings, 'pr3d' | 'shadows' | 'shadowMapSize' | 'grassDensity' | 'grassDist' | 'viewDist' | 'antialias' | 'post'>;
const SETTINGS_2D: Record<Tier, Settings2D> = {
  0: { dprCap: 1, particleBudget: 0.3, nebula: false, farPlanet: false, starLayers: 1, glows: false, atmospheres: false, vignette: false, shake: false, fpsCap: 30, trailDensity: 0.35, heroCache: 2, bloom: false, dynLights: false, softShadows: false, ambientParticles: false, grade: false },
  1: { dprCap: 1.25, particleBudget: 0.5, nebula: false, farPlanet: true, starLayers: 2, glows: true, atmospheres: false, vignette: false, shake: true, fpsCap: 60, trailDensity: 0.6, heroCache: 2, bloom: false, dynLights: false, softShadows: true, ambientParticles: false, grade: false },
  2: { dprCap: 1.6, particleBudget: 0.8, nebula: true, farPlanet: true, starLayers: 3, glows: true, atmospheres: true, vignette: true, shake: true, fpsCap: 60, trailDensity: 0.85, heroCache: 2, bloom: false, dynLights: true, softShadows: true, ambientParticles: true, grade: true },
  3: { dprCap: 2, particleBudget: 1, nebula: true, farPlanet: true, starLayers: 3, glows: true, atmospheres: true, vignette: true, shake: true, fpsCap: 60, trailDensity: 1, heroCache: 0, bloom: true, dynLights: true, softShadows: true, ambientParticles: true, grade: true },
};
/** parte 3D: pr3d/shadows iguais ao q3For de sempre; grama vem de natureQ (fonte única) */
const SETTINGS_3D: Record<Tier, Pick<QualitySettings, 'pr3d' | 'shadows' | 'shadowMapSize' | 'viewDist' | 'antialias' | 'post'>> = {
  0: { pr3d: 0.6, shadows: false, shadowMapSize: 0, viewDist: 0.6, antialias: false, post: false },
  1: { pr3d: 0.8, shadows: false, shadowMapSize: 0, viewDist: 0.75, antialias: false, post: false },
  2: { pr3d: 1.0, shadows: false, shadowMapSize: 0, viewDist: 0.9, antialias: true, post: false },
  3: { pr3d: 1.5, shadows: true, shadowMapSize: 1024, viewDist: 1, antialias: true, post: true },
};
const SETTINGS = {} as Record<Tier, QualitySettings>;
for (const t of [0, 1, 2, 3] as Tier[]) {
  const g = natureQ(t).grass;
  SETTINGS[t] = { ...SETTINGS_2D[t], ...SETTINGS_3D[t], grassDensity: g ? g.density : 0, grassDist: g ? g.dist : 0 };
}

/**
 * Ajustes do nível. Com a "Economia de bateria" ligada, todo nível fica em 30 fps
 * (os governors dobram os limites de tempo de quadro com fpsCap 30, então não descem à toa).
 */
export function settingsFor(tier: Tier): QualitySettings {
  const s = { ...SETTINGS[clampTier(tier)] };
  if (batterySaver()) s.fpsCap = 30;
  return s;
}

export function clampTier(n: number): Tier {
  return (n <= 0 ? 0 : n >= 3 ? 3 : Math.round(n)) as Tier;
}

/* ----------------------------- storage ----------------------------- */

const MODE_KEY = 'bo-quality';
const DETECT_KEY = 'bo-quality-detect';

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage indisponível */
  }
}

function appVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  } catch {
    return 'dev';
  }
}

/** Modo escolhido pelo jogador: 'auto' (padrão) ou um nível fixo. */
export function loadMode(): QualityMode {
  const v = lsGet(MODE_KEY);
  if (v === null || v === 'auto') return 'auto';
  const n = Number(v);
  return Number.isFinite(n) ? clampTier(n) : 'auto';
}
export function saveMode(m: QualityMode): void {
  lsSet(MODE_KEY, String(m));
}

/** Migra o antigo toggle "Modo economia" (save.lowFx) para o modo Baixo, uma única vez. */
export function migrateLowFx(lowFx: boolean): void {
  if (lowFx && lsGet(MODE_KEY) === null) saveMode(1);
}

/* ---- economia de bateria (30 fps em tudo) ---- */
const BATTERY_KEY = 'bo-battery';
let battery: boolean | null = null;
export function batterySaver(): boolean {
  if (battery === null) battery = lsGet(BATTERY_KEY) === '1';
  return battery;
}
/** Liga/desliga a economia de bateria; avisa por bus 'battery' (src/core/framecap.ts limita o rAF). */
export function setBatterySaver(on: boolean): void {
  battery = on;
  lsSet(BATTERY_KEY, on ? '1' : '0');
  fpsLimiter.cap = on ? 30 : 60;
  bus.emit('battery', on);
}

export interface DetectCache {
  v: string;
  tier: Tier;
  /** último nível estável do modo automático (aprendido pelo governor) */
  learned?: Tier;
  /** score do benchmark de canvas 2D (ops/ms) */
  score?: number;
  /** teto do aparelho (hardware + tabela de GPU + RAM): o automático nunca passa dele */
  cap?: Tier;
  /** hash do perfil do aparelho (syncProfileKey) — mudou o aparelho/WebView, refaz */
  ph?: string;
  /** como foi decidido: 'gpu' = teste 3D completo; 'canvas' = só o 2D (fallback); 'safe' = teste anterior travou */
  method?: 'gpu' | 'canvas' | 'safe';
  /** score do teste 3D (quadros/s equivalentes no cenário de referência) */
  gpuScore?: number;
  /** nome amigável do aparelho e da GPU (Ajustes) */
  dev?: string;
  gpu?: string;
  /** quando foi medido (ms epoch) */
  at?: number;
  /** ms gastos no teste */
  ms?: number;
}

/**
 * Chave barata e síncrona do aparelho (UA sem números de versão do navegador, núcleos,
 * memória, tela). Atualização do WebView não muda; trocar de aparelho / restaurar backup muda.
 */
export function syncProfileKey(): string {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const ua = (nav.userAgent || '').replace(/(Chrome|Version|Safari|AppleWebKit|Firefox|Edg|OPR|SamsungBrowser)\/[\d.]+/g, '$1');
    const sw = typeof screen !== 'undefined' ? Math.max(screen.width, screen.height) + 'x' + Math.min(screen.width, screen.height) : '';
    const dpr = typeof window !== 'undefined' ? Math.round((window.devicePixelRatio || 1) * 100) : 0;
    const raw = [ua, nav.hardwareConcurrency || 0, nav.deviceMemory || 0, sw, dpr].join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619) >>> 0;
    return h.toString(36);
  } catch {
    return '';
  }
}

function readCache(): DetectCache | null {
  try {
    const raw = lsGet(DETECT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DetectCache;
    if (!o || o.v !== appVersion() || typeof o.tier !== 'number') return null;
    if (o.ph && o.ph !== syncProfileKey()) return null;
    return o;
  } catch {
    return null;
  }
}
function writeCache(c: DetectCache): void {
  lsSet(DETECT_KEY, JSON.stringify(c));
}

/**
 * Precisa do teste do aparelho (tela "Ajustando os gráficos…")? Sim na 1ª abertura, quando a
 * versão do app muda e quando o perfil do aparelho muda. Cache antigo sem `method` = versão velha.
 */
export function needsDeviceCheck(): boolean {
  const c = readCache();
  return !c || !c.method;
}

/** Grava o resultado do teste do aparelho (src/core/devicecheck.ts) e zera o nível aprendido. */
export function storeDetection(c: Omit<DetectCache, 'v' | 'ph' | 'at'>): DetectCache {
  const full: DetectCache = { ...c, v: appVersion(), ph: syncProfileKey(), at: Date.now() };
  delete full.learned;
  writeCache(full);
  detected = clampTier(full.tier);
  return full;
}

/** Teto do automático para este aparelho (padrão do QualityGovernor.maxTier). */
export function deviceCeiling(): Tier {
  const c = readCache();
  return c && typeof c.cap === 'number' ? clampTier(Math.max(c.cap, c.tier)) : MAX_TIER;
}

/* ----------------------------- detecção ----------------------------- */

/** Teto pelo hardware declarado (memória, núcleos, UA, pixels). */
export function hardwareCap(): Tier {
  let cap: Tier = 3;
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory;
  if (typeof mem === 'number' && mem > 0) {
    if (mem <= 1) cap = 0;
    else if (mem <= 2) cap = Math.min(cap, 1) as Tier;
    else if (mem <= 4) cap = Math.min(cap, 2) as Tier;
  }
  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0) {
    if (cores <= 2) cap = Math.min(cap, 1) as Tier;
    else if (cores <= 4) cap = Math.min(cap, 2) as Tier;
  }
  const ua = nav.userAgent || '';
  // Android Go / versões antigas do Android: aparelhos de entrada
  if (/Android Go|Go Edition/i.test(ua)) cap = Math.min(cap, 1) as Tier;
  const av = /Android (\d+)/.exec(ua);
  if (av) {
    const v = Number(av[1]);
    if (v <= 7) cap = Math.min(cap, 1) as Tier;
    else if (v <= 9) cap = Math.min(cap, 2) as Tier;
  }
  // muitos pixels físicos com CPU modesta = fill-rate apertado
  if (typeof window !== 'undefined' && typeof screen !== 'undefined') {
    const dpr = window.devicePixelRatio || 1;
    const px = screen.width * screen.height * dpr * dpr;
    if (px > 3.6e6 && typeof cores === 'number' && cores <= 4) cap = Math.min(cap, 1) as Tier;
  }
  return cap;
}

/**
 * Micro-benchmark sintético (~maxMs): círculos com degradê radial + blits aditivos
 * num canvas fora da tela, forçando a GPU/rasterizador a terminar com getImageData.
 * Retorna operações por milissegundo (maior = mais rápido) ou -1 se indisponível.
 */
export function canvasBenchmark(maxMs = 220): number {
  if (typeof document === 'undefined') return -1;
  try {
    const size = 320;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    if (!x) return -1;
    const spr = document.createElement('canvas');
    spr.width = spr.height = 64;
    const sx = spr.getContext('2d')!;
    const sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, 'rgba(255,200,255,1)');
    sg.addColorStop(1, 'rgba(255,80,200,0)');
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 64, 64);
    // aquece (compilação de shaders, alocação)
    x.drawImage(spr, 0, 0);
    x.getImageData(0, 0, 1, 1);

    let ops = 0;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * size;
    const t0 = performance.now();
    let el = 0;
    while (el < maxMs) {
      for (let i = 0; i < 32; i++) {
        const cx = r();
        const cy = r();
        const rad = 18 + (i % 4) * 10;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, 'rgba(90,30,160,0)');
        x.globalCompositeOperation = 'source-over';
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, rad, 0, Math.PI * 2);
        x.fill();
        x.globalCompositeOperation = 'lighter';
        x.drawImage(spr, r() - 48, r() - 48, 96, 96);
        x.drawImage(spr, r() - 32, r() - 32);
        x.drawImage(c, 0, 0, size, size, r() * 0.1, r() * 0.1, size * 0.5, size * 0.5);
        ops += 4;
      }
      x.getImageData(0, 0, 1, 1); // força o flush do lote
      el = performance.now() - t0;
    }
    return ops / el;
  } catch {
    return -1;
  }
}

/** Limiares do benchmark (ops/ms). Calibrados em Chromium: aparelho médio ≈ 25-60. */
export const BENCH_THRESHOLDS = { t1: 4, t2: 10, t3: 22 };

export function tierFromScore(score: number): Tier {
  if (score < 0) return 2;
  if (score >= BENCH_THRESHOLDS.t3) return 3;
  if (score >= BENCH_THRESHOLDS.t2) return 2;
  if (score >= BENCH_THRESHOLDS.t1) return 1;
  return 0;
}

let detected: Tier | null = null;

/**
 * Nível inicial: min(teto do hardware, nível do benchmark), em cache no localStorage.
 * Refaz a detecção quando a versão do app muda. Se o governor já aprendeu um nível
 * estável numa sessão anterior, começa por ele.
 */
export function detectInitialTier(opts: { force?: boolean } = {}): Tier {
  if (detected !== null && !opts.force) return detected;
  const cached = opts.force ? null : readCache();
  if (cached) {
    detected = clampTier(cached.learned ?? cached.tier);
    return detected;
  }
  const cap = hardwareCap();
  const score = cap === 0 ? -1 : canvasBenchmark();
  const bench = cap === 0 ? 0 : tierFromScore(score);
  const tier = Math.min(cap, bench) as Tier;
  writeCache({ v: appVersion(), tier, score: Math.round(score * 10) / 10, cap, ph: syncProfileKey(), at: Date.now() });
  detected = tier;
  return tier;
}

/** Último diagnóstico salvo (para debug/ajustes). */
export function lastDetection(): DetectCache | null {
  return readCache();
}

function rememberLearned(t: Tier): void {
  const c = readCache();
  if (c) writeCache({ ...c, learned: t });
}

/* ----------------------------- governor ----------------------------- */

export interface GovernorOptions {
  /** nível inicial do modo automático (padrão: detectInitialTier()) */
  initial?: Tier;
  /** modo inicial (padrão: loadMode()) */
  mode?: QualityMode;
  /** teto do automático (padrão 3) */
  maxTier?: Tier;
  onChange?: (tier: Tier, settings: QualitySettings, reason: string) => void;
  /** emite bus.emit('quality', tier, settings) (padrão true) */
  emit?: boolean;
  /** persiste o modo e o nível aprendido no localStorage (padrão true) */
  persist?: boolean;
  /**
   * Resolução dinâmica (modos 3D): fator 0..1 a multiplicar no pixel ratio do nível.
   * Com este callback o governor reage RÁPIDO (~0,5 s) a quadros lentos baixando a
   * resolução em passos de 10% até minResScale, e só depois desce de nível (exceto picos
   * fortes). Sobe 5% por vez com folga sustentada. Só no modo automático.
   */
  onResScale?: (scale: number) => void;
  /** piso da resolução dinâmica (padrão 0.6) */
  minResScale?: number;
}

const BUCKET_MS = 250;
const N_BUCKETS = 40; // 10 s de histórico

/**
 * Recebe o tempo de cada frame desenhado e ajusta o nível:
 * - DESCE quando a média passa de 20 ms por ~2 s, ou de 40 ms por ~0,5 s
 *   (com fpsCap 30 os limites dobram);
 * - SOBE com cautela: folga sustentada por 10 s, no máximo 1 passo a cada 20 s,
 *   e o intervalo dobra cada vez que uma subida "não colou" (anti-oscilação).
 */
export class QualityGovernor {
  private _tier: Tier;
  private _mode: QualityMode;
  private autoTier: Tier;
  private _settings: QualitySettings;
  maxTier: Tier;
  private opts: GovernorOptions;

  // baldes de 250 ms: soma de frame, soma de trabalho, contagem
  private bSum = new Float64Array(N_BUCKETS);
  private bWork = new Float64Array(N_BUCKETS);
  private bWorkN = new Uint16Array(N_BUCKETS);
  private bN = new Uint16Array(N_BUCKETS);
  private filled = 0;
  private head = 0;
  private curSum = 0;
  private curWork = 0;
  private curWorkN = 0;
  private curN = 0;
  private curT = 0;

  private clock = 0; // ms acumulados de amostras
  private grace = 0; // ignora amostras logo após mudança (rebuild de sprites)
  private lastChange = -1e9;
  private lastUp = -1e9;
  private upCooldown = 20000;
  private lastUpFrom: Tier | null = null;
  // resolução dinâmica
  private _res = 1;
  private resAt = -1e9;
  private resUpWait = 3000;
  private resLastUp = -1e9;

  constructor(opts: GovernorOptions = {}) {
    this.opts = opts;
    // teto do automático: o que o teste do aparelho liberou (nunca sobe além disso sozinho)
    this.maxTier = opts.maxTier ?? deviceCeiling();
    // o modo manual (Ajustes) vale para TODOS os jogos, inclusive os que não persistem nada
    this._mode = opts.mode ?? loadMode();
    this.autoTier = clampTier(Math.min(opts.initial ?? detectInitialTier(), this.maxTier));
    this._tier = this._mode === 'auto' ? this.autoTier : this._mode;
    this._settings = settingsFor(this._tier);
  }

  get tier(): Tier {
    return this._tier;
  }
  get mode(): QualityMode {
    return this._mode;
  }
  get settings(): QualitySettings {
    return this._settings;
  }
  /** fator da resolução dinâmica (1 = pixel ratio cheio do nível) */
  get resScale(): number {
    return this._res;
  }

  /** Troca o modo (menu de Ajustes). 'auto' retoma do último nível automático. */
  setMode(m: QualityMode): void {
    this._mode = m;
    if (this.opts.persist !== false) saveMode(m);
    this.resetWindow();
    this.upCooldown = 20000;
    this.setRes(1);
    this.apply(m === 'auto' ? this.autoTier : m, 'manual');
  }

  /**
   * Recomeça o automático num nível novo (depois de "Testar meu aparelho de novo").
   * Também reaplica os ajustes (ex.: economia de bateria mudou o fpsCap) mesmo sem trocar de nível.
   */
  rebase(initial: Tier, maxTier: Tier = deviceCeiling()): void {
    this.maxTier = maxTier;
    this.autoTier = clampTier(Math.min(initial, maxTier));
    this.upCooldown = 20000;
    this.lastUpFrom = null;
    this.resetWindow();
    this.setRes(1);
    this.refresh(this._mode === 'auto' ? this.autoTier : this._mode, 'rebase');
  }

  /** Reaplica settingsFor(tier) e avisa mesmo se o nível não mudou (economia de bateria). */
  refresh(t: Tier = this._tier, reason = 'refresh'): void {
    this._tier = t;
    this._settings = settingsFor(t);
    this.opts.onChange?.(t, this._settings, reason);
    if (this.opts.emit !== false) bus.emit('quality', t, this._settings);
  }

  /**
   * Chame uma vez por frame DESENHADO.
   * @param frameMs intervalo desde o último frame desenhado (ms)
   * @param workMs  opcional: tempo de CPU de update+render deste frame. Em telas 60 Hz o
   *                intervalo nunca cai abaixo de 16,7 ms, então a folga para SUBIR é medida por ele.
   */
  sample(frameMs: number, workMs?: number): void {
    if (!(frameMs > 0)) return;
    // pausas, troca de aba, GC gigante: não dizem nada sobre o nível
    if (frameMs > 250) return;
    this.clock += frameMs;
    if (this.grace > 0) {
      this.grace -= frameMs;
      return;
    }
    this.curSum += frameMs;
    this.curN++;
    if (workMs !== undefined && workMs >= 0) {
      this.curWork += workMs;
      this.curWorkN++;
    }
    this.curT += frameMs;
    if (this.curT >= BUCKET_MS) this.closeBucket();
  }

  private closeBucket(): void {
    const h = this.head;
    this.bSum[h] = this.curSum;
    this.bN[h] = this.curN;
    this.bWork[h] = this.curWork;
    this.bWorkN[h] = this.curWorkN;
    this.head = (h + 1) % N_BUCKETS;
    this.filled = Math.min(N_BUCKETS, this.filled + 1);
    this.curSum = this.curWork = this.curT = 0;
    this.curN = this.curWorkN = 0;
    if (this._mode === 'auto') {
      if (this.opts.onResScale) this.evaluateRes();
      this.evaluate();
    }
  }

  private setRes(r: number): void {
    r = Math.round(r * 100) / 100;
    if (r === this._res) return;
    this._res = r;
    this.resAt = this.clock;
    this.opts.onResScale?.(r);
  }

  /** resolução dinâmica: decide a cada balde de 250 ms */
  private evaluateRes(): void {
    const k = this._settings.fpsCap === 30 ? 2 : 1;
    const min = this.opts.minResScale ?? 0.6;
    const a05 = this.avg(2);
    if (a05 < 0) return;
    // descer: quadro médio > 19 ms em 0,5 s (um passo por 0,5 s)
    if (a05 > 19 * k && this._res > min + 1e-3 && this.clock - this.resAt >= 500) {
      // subida recente que não colou: espera mais para tentar de novo
      if (this.clock - this.resLastUp < 2000) this.resUpWait = Math.min(this.resUpWait * 2, 60000);
      this.setRes(Math.max(min, this._res - 0.1));
      return;
    }
    // subir: 3 s seguidos em dia (≈ 60 fps) desde a última mudança
    if (this._res < 1 && this.clock - this.resAt >= this.resUpWait) {
      const a3 = this.avg(12);
      if (a3 > 0 && a3 < 17.8 * k) {
        this.resLastUp = this.clock;
        this.setRes(Math.min(1, this._res + 0.05));
      }
    }
  }

  /** média do frame nos últimos k baldes (ou -1 se não houver histórico suficiente) */
  private avg(k: number): number {
    if (this.filled < k) return -1;
    let s = 0;
    let n = 0;
    for (let i = 1; i <= k; i++) {
      const j = (this.head - i + N_BUCKETS) % N_BUCKETS;
      s += this.bSum[j];
      n += this.bN[j];
    }
    return n ? s / n : -1;
  }
  private avgWork(k: number): number {
    if (this.filled < k) return -1;
    let s = 0;
    let n = 0;
    for (let i = 1; i <= k; i++) {
      const j = (this.head - i + N_BUCKETS) % N_BUCKETS;
      s += this.bWork[j];
      n += this.bWorkN[j];
    }
    return n >= k * 4 ? s / n : -1;
  }

  private evaluate(): void {
    const cap30 = this._settings.fpsCap === 30;
    const k = cap30 ? 2 : 1;
    const t = this.autoTier;
    // ---- descer ----
    if (t > 0) {
      const a2 = this.avg(8);
      const a05 = this.avg(2);
      let why = '';
      // com resolução dinâmica, lentidão moderada primeiro reduz a resolução até o piso
      const resLeft = !!this.opts.onResScale && this._res > (this.opts.minResScale ?? 0.6) + 1e-3;
      if (a05 > 40 * k) why = `pico ${a05.toFixed(1)}ms/0.5s`;
      else if (a2 > 20 * k && !resLeft) why = `lento ${a2.toFixed(1)}ms/2s`;
      if (why) {
        // a subida recente não se sustentou: espera o dobro antes de tentar de novo
        if (this.lastUpFrom === t - 1 && this.clock - this.lastUp < 15000) this.upCooldown = Math.min(this.upCooldown * 2, 160000);
        this.lastUpFrom = null;
        this.step((t - 1) as Tier, why);
        return;
      }
    }
    // ---- subir ----
    if (t < this.maxTier && this.clock - this.lastChange >= this.upCooldown && this.filled >= N_BUCKETS) {
      const a10 = this.avg(N_BUCKETS);
      const w10 = this.avgWork(N_BUCKETS);
      // folga: frame < 12 ms (telas >60 Hz) ou CPU < 8 ms com o frame em dia
      const headroom = (a10 > 0 && a10 < 12) || (w10 >= 0 && w10 < 8 && a10 < (cap30 ? 36 : 18));
      if (headroom) {
        this.lastUp = this.clock;
        this.lastUpFrom = t;
        this.step((t + 1) as Tier, `folga ${a10.toFixed(1)}ms` + (w10 >= 0 ? ` cpu ${w10.toFixed(1)}ms` : ''));
      }
    }
  }

  private step(t: Tier, reason: string): void {
    // subindo de nível a resolução dinâmica recomeça cheia; descendo, mantém o fator atual
    if (t > this.autoTier) this.setRes(1);
    this.autoTier = t;
    if (this.opts.persist !== false) rememberLearned(t);
    this.resetWindow();
    this.apply(t, reason);
  }

  private resetWindow(): void {
    this.filled = 0;
    this.head = 0;
    this.curSum = this.curWork = this.curT = 0;
    this.curN = this.curWorkN = 0;
    this.grace = 600;
    this.lastChange = this.clock;
  }

  private apply(t: Tier, reason: string): void {
    if (t === this._tier) return;
    this._tier = t;
    this._settings = settingsFor(t);
    this.opts.onChange?.(t, this._settings, reason);
    if (this.opts.emit !== false) bus.emit('quality', t, this._settings);
  }
}

/* ----------------------------- limitador ----------------------------- */

/**
 * Limite de fps num laço rAF. Uso:
 *   if (!limiter.shouldRender(now)) return;   // logo após agendar o próximo rAF
 * Em 60 Hz com cap 30 desenha 1 a cada 2 callbacks; em 120 Hz com cap 60, 1 a cada 2.
 */
export class FpsLimiter {
  cap: number;
  private last = -1;
  constructor(cap = 60) {
    this.cap = cap;
  }
  shouldRender(now: number): boolean {
    if (this.last < 0) {
      this.last = now;
      return true;
    }
    const interval = 1000 / this.cap;
    const el = now - this.last;
    // tolerância de jitter do vsync (~1,5 ms)
    if (el < interval - 1.5) return false;
    // não acumula atraso: um frame perdido não vira rajada de frames
    this.last = el > interval * 2 ? now : this.last + interval * Math.max(1, Math.floor((el + 1.5) / interval));
    return true;
  }
  reset(): void {
    this.last = -1;
  }
}

export const fpsLimiter = new FpsLimiter(batterySaver() ? 30 : 60);
