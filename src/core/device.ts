/* ============================================================
 *  PERFIL DO APARELHO — o que dá pra saber sem permissão nenhuma:
 *  GPU (WEBGL_debug_renderer_info), WebGL2, textura máxima, float, instancing;
 *  núcleos, memória, tela × DPR; no Android, o plugin nativo BloopDevice
 *  (MainActivity) devolve modelo, fabricante, RAM total, isLowRamDevice, SDK, GLES.
 *  Fora do app: modelo pelo user agent (Client Hints quando houver).
 *  Tabela de GPUs conhecidas → teto de nível (0 Mínimo … 3 Alto).
 *  Nada aqui é dado pessoal: só hardware.
 * ============================================================ */
import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';
import type { Tier } from './quality';

export interface NativeDeviceInfo {
  model?: string;
  manufacturer?: string;
  brand?: string;
  hardware?: string;
  soc?: string;
  socManufacturer?: string;
  sdk?: number;
  release?: string;
  cores?: number;
  /** bytes */
  totalMem?: number;
  lowRam?: boolean;
  memoryClass?: number;
  glEs?: string;
}

interface BloopDevicePlugin {
  info(): Promise<NativeDeviceInfo>;
  /** desde a v1.2.45: abre a tela do app nas Configurações do Android (permissões) */
  openAppSettings(): Promise<void>;
}
const Native = registerPlugin<BloopDevicePlugin>('BloopDevice');

/**
 * Abre as configurações do app no Android (para liberar câmera/microfone negados com
 * "não perguntar de novo"). false: não deu (web, iOS ou APK antigo sem o método).
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNative) return false;
  try {
    await Native.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

export interface DeviceProfile {
  /** GPU sem máscara (ex.: "Mali-G52 MC2", "Adreno (TM) 610") ou '' */
  gpu: string;
  gpuVendor: string;
  webgl: boolean;
  webgl2: boolean;
  maxTex: number;
  floatTex: boolean;
  instancing: boolean;
  cores: number;
  /** GB (navigator.deviceMemory, arredondado pelo navegador) ou 0 */
  mem: number;
  /** RAM total em MB (nativo) ou 0 */
  ramMB: number;
  lowRam: boolean;
  screenW: number;
  screenH: number;
  dpr: number;
  model: string;
  manufacturer: string;
  /** Android SDK_INT (nativo) ou versão do Android pelo UA, 0 = não é Android */
  sdk: number;
  android: number;
  glEs: string;
  soc: string;
  native: boolean;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Lê as capacidades WebGL num contexto descartável (liberado na hora). */
export function probeWebGL(): Pick<DeviceProfile, 'gpu' | 'gpuVendor' | 'webgl' | 'webgl2' | 'maxTex' | 'floatTex' | 'instancing'> {
  const out = { gpu: '', gpuVendor: '', webgl: false, webgl2: false, maxTex: 0, floatTex: false, instancing: false };
  if (typeof document === 'undefined') return out;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null;
    if (gl) out.webgl2 = true;
    else gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return out;
    out.webgl = true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    out.gpuVendor = String((dbg && gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || '');
    out.maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    out.floatTex = out.webgl2 ? !!gl.getExtension('EXT_color_buffer_float') : !!gl.getExtension('OES_texture_float');
    out.instancing = out.webgl2 || !!gl.getExtension('ANGLE_instanced_arrays');
  } catch {
    /* sem WebGL */
  } finally {
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      /* */
    }
  }
  return out;
}

/** Modelo pelo UA ("Android 10; SM-A105M Build/…"); UA reduzido ("Android 10; K") não serve. */
function uaModel(ua: string): string {
  const m = /Android [\d.]+;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/i.exec(ua);
  const s = m ? m[1].trim() : '';
  return s && s !== 'K' && !/^wv$/i.test(s) ? s : '';
}

/** Coleta o perfil completo. Nunca lança; demora no máximo ~1 s (plugin nativo / Client Hints). */
export async function collectProfile(): Promise<DeviceProfile> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { getHighEntropyValues?(h: string[]): Promise<{ model?: string; platformVersion?: string }> };
  };
  const ua = nav.userAgent || '';
  const gl = probeWebGL();
  const av = /Android (\d+)/.exec(ua);
  const p: DeviceProfile = {
    ...gl,
    cores: nav.hardwareConcurrency || 0,
    mem: nav.deviceMemory || 0,
    ramMB: 0,
    lowRam: false,
    screenW: Math.max(screen.width, screen.height),
    screenH: Math.min(screen.width, screen.height),
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    model: uaModel(ua),
    manufacturer: '',
    sdk: 0,
    android: av ? Number(av[1]) : 0,
    glEs: '',
    soc: '',
    native: false,
  };
  if (isNative) {
    const n = await withTimeout(Native.info(), 1000);
    if (n) {
      p.native = true;
      if (n.model) p.model = n.model;
      if (n.manufacturer) p.manufacturer = n.manufacturer;
      if (n.sdk) p.sdk = n.sdk;
      if (n.cores) p.cores = Math.max(p.cores, n.cores);
      if (n.totalMem) p.ramMB = Math.round(n.totalMem / 1048576);
      p.lowRam = !!n.lowRam;
      p.glEs = n.glEs || '';
      p.soc = [n.socManufacturer, n.soc].filter((s) => s && s !== 'unknown').join(' ') || n.hardware || '';
    }
  }
  if (!p.model && nav.userAgentData?.getHighEntropyValues) {
    const h = await withTimeout(nav.userAgentData.getHighEntropyValues(['model', 'platformVersion']), 600);
    if (h?.model) p.model = h.model;
  }
  return p;
}

/* ----------------------------- tabela de GPUs ----------------------------- */

export interface GpuClass {
  /** família legível (ex.: "Mali-G52", "Adreno 610", "Software") */
  family: string;
  /** teto de nível pela GPU (3 = sem restrição) */
  cap: Tier;
  /** conhecida na tabela? */
  known: boolean;
}

/**
 * Teto pela GPU. Conservador nas famílias de entrada (tablets baratos: Mali-400/450, T720,
 * PowerVR GE8xxx, Adreno 3xx/50x); as de topo ficam sem teto (o benchmark decide).
 */
export function classifyGpu(renderer: string): GpuClass {
  const r = renderer || '';
  const c = (family: string, cap: Tier): GpuClass => ({ family, cap, known: true });
  if (!r) return { family: '?', cap: 3, known: false };
  // renderização por software: nunca passa do Baixo
  if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(r)) return c('Software', 1);
  let m: RegExpExecArray | null;
  // ---- ARM Mali ----
  if ((m = /Mali-(\d{3})/i.exec(r))) return c(`Mali-${m[1]}`, 0); // Utgard: 400/450/470
  if ((m = /Mali-T(\d{3})/i.exec(r))) {
    const n = Number(m[1]);
    return c(`Mali-T${n}`, n === 880 ? 2 : 1); // Midgard: T6xx/T7xx/T8xx
  }
  if ((m = /Mali-G(\d{2,3})/i.exec(r))) {
    const n = Number(m[1]);
    // Bifrost/Valhall: G31 entrada; G51/G52/G57 meio; G68+/G7x/G610+ topo
    const cap: Tier = n === 31 ? 1 : n === 51 || n === 52 || n === 57 ? 2 : 3;
    return c(`Mali-G${n}`, cap);
  }
  if (/Immortalis/i.test(r)) return c('Immortalis', 3);
  // ---- Qualcomm Adreno ----
  if ((m = /Adreno\D*(\d{3})/i.exec(r))) {
    const n = Number(m[1]);
    let cap: Tier;
    if (n < 300) cap = 0;
    else if (n < 320) cap = 0; // 304/305/306/308
    else if (n < 400) cap = 1; // 320/330
    else if (n < 418) cap = 1; // 405
    else if (n < 500) cap = 2; // 418/420/430
    else if (n <= 508) cap = 1; // 504/505/506/508
    else if (n < 530) cap = 2; // 509/510/512
    else if (n < 600) cap = 3; // 530/540
    else if (n <= 613 || (n >= 618 && n <= 620)) cap = 2; // 610/612/613/618/619/620
    else cap = 3; // 616/630/640/642/643/644/650/660/7xx/8xx
    return c(`Adreno ${n}`, cap);
  }
  // ---- Imagination PowerVR ----
  if (/PowerVR|IMG|Rogue/i.test(r)) {
    if (/SGX/i.test(r)) return c('PowerVR SGX', 0);
    if ((m = /GE(\d{4})/i.exec(r))) return c(`PowerVR GE${m[1]}`, Number(m[1]) < 8320 ? 0 : 1);
    if ((m = /G[MXT](\d{4})/i.exec(r))) return c(`PowerVR ${m[0]}`, 2);
    if (/BXM|BXE|BXS/i.test(r)) return c('PowerVR B', 2);
    return c('PowerVR', 1);
  }
  if (/VideoCore/i.test(r)) return c('VideoCore', 0);
  if (/Tegra/i.test(r)) return c('Tegra', 2);
  if ((m = /Xclipse|Maleoon/i.exec(r))) return c(m[0], 3);
  if (/Apple/i.test(r)) return c('Apple GPU', 3);
  // ---- desktop ----
  if (/GeForce|NVIDIA|Quadro|RTX|GTX/i.test(r)) return c('NVIDIA', 3);
  if (/Radeon|AMD/i.test(r)) return c('AMD Radeon', 3);
  if (/Iris|Arc/i.test(r)) return c('Intel Iris/Arc', 3);
  if (/Intel/i.test(r)) return c('Intel HD/UHD', 2);
  return { family: r.slice(0, 40), cap: 3, known: false };
}

/** Teto pela memória/RAM declarada pelo sistema (nativo). */
export function ramCap(p: DeviceProfile): Tier {
  let cap: Tier = 3;
  if (p.lowRam) cap = 1;
  if (p.ramMB > 0) {
    if (p.ramMB <= 1600) cap = 0;
    else if (p.ramMB <= 2600) cap = Math.min(cap, 1) as Tier;
    else if (p.ramMB <= 4600) cap = Math.min(cap, 2) as Tier;
  }
  if (p.sdk > 0 && p.sdk <= 25) cap = Math.min(cap, 1) as Tier; // Android 7.x ou mais velho
  if (!p.webgl) cap = 0;
  else if (!p.webgl2 && p.maxTex > 0 && p.maxTex <= 4096) cap = Math.min(cap, 1) as Tier;
  return cap;
}

const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Nome amigável para os Ajustes: "Samsung SM-A105M", "Moto G (7)", "Chrome · Linux"… */
export function deviceName(p: DeviceProfile): string {
  if (p.model) {
    const man = cap1(p.manufacturer.trim());
    return man && !p.model.toLowerCase().startsWith(man.toLowerCase()) ? `${man} ${p.model}` : p.model;
  }
  const ua = navigator.userAgent || '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || '?';
}

/** GPU curta para mostrar/enviar ("Mali-G52 MC2", "ANGLE (NVIDIA …)" → "NVIDIA …"). */
export function gpuShort(renderer: string): string {
  let r = (renderer || '').replace(/\(TM\)|\(R\)/g, '').replace(/\s+/g, ' ').trim();
  const angle = /^ANGLE \((.*)\)$/.exec(r);
  if (angle) r = angle[1].split(',').slice(1, 2).join('').trim() || angle[1];
  r = r.replace(/Direct3D.*$|vs_\d.*$|OpenGL.*$|\(0x[0-9A-F]+\)/gi, '').replace(/\s+\)/g, ')').trim();
  return r.slice(0, 48);
}
