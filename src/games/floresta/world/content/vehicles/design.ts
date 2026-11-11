/* ============================================================
 *  VEÍCULOS DO MUNDO — formato do PROJETO (design), encaixe na grade,
 *  validação, ficha técnica (massa, potência, velocidade, consumo,
 *  carga) e layout físico (posição local de rodas, boias, ferramentas)
 *  que o modelo 3D e a física usam. Puro: sem DOM/three/cannon.
 *
 *  Eixos locais do veículo: X = direita, Y = cima, −Z = FRENTE
 *  (mesma convenção do three.js). Fileira z = 0 da grade é a frente.
 * ============================================================ */
import { t } from '../../../../../i18n';
import { CELL, PART, type FuelKind, type PartDef } from './parts';

export type Rot = 0 | 1 | 2 | 3;
export interface PlacedPart {
  /** id da peça (vp_*) */
  p: string;
  /** célula âncora (canto frente-esquerda da pegada já girada) */
  x: number;
  z: number;
  r: Rot;
}
export interface VehicleDesign {
  v: 1;
  id: string;
  name: string;
  chassis: string;
  parts: PlacedPart[];
  paint: string;
}

/* ------------------------------ constantes do modelo físico ------------------------------ */
/** força = potência × KP / max(v, V0) */
export const KP = 70;
export const V0 = 1.5;
export const CRR = 0.03;
export const G_DEFAULT = 20;
/** massa do piloto */
export const DRIVER = 3;
/** massa de referência de uma tora (o motor do mundo usa 3) */
export const LOG_MASS = 3;
export const DECK_T = 0.2;
/** massa de jogo → kg mostrado (uma tora = 150 kg) */
export const MASS_KG = 50;

export const PAINTS = ['#ff4f6a', '#3ec05a', '#3a8aff', '#ffb02e', '#8a5cff', '#ff8a3a', '#ffd34a', '#2ad0c0', '#f4f6fc', '#3a3f48'];

/* ------------------------------ grade ------------------------------ */
export function gridOf(d: VehicleDesign): [number, number] {
  return PART.get(d.chassis)?.grid ?? [3, 4];
}
export function footprint(def: PartDef, r: Rot): [number, number] {
  return r & 1 ? [def.l, def.w] : [def.w, def.l];
}
export function newDesign(chassis = 'vp_chassi_m', name = ''): VehicleDesign {
  return { v: 1, id: 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, chassis, parts: [], paint: PAINTS[0] };
}
export function cloneDesign(d: VehicleDesign): VehicleDesign {
  return { ...d, parts: d.parts.map((p) => ({ ...p })) };
}

/** peça que ocupa (x, z) numa camada */
export function partAt(d: VehicleDesign, layer: 'deck' | 'under', x: number, z: number): PlacedPart | null {
  for (const pp of d.parts) {
    const def = PART.get(pp.p);
    if (!def || def.layer !== layer) continue;
    const [w, l] = footprint(def, pp.r);
    if (x >= pp.x && x < pp.x + w && z >= pp.z && z < pp.z + l) return pp;
  }
  return null;
}

export type PlaceErr = 'bounds' | 'busy' | 'edge' | 'front' | 'back' | 'center' | 'ends' | 'chassis';
/** null = cabe; senão o motivo */
export function canPlace(d: VehicleDesign, id: string, x: number, z: number, r: Rot, ignore?: PlacedPart): PlaceErr | null {
  const def = PART.get(id);
  if (!def || def.cat === 'chassis') return 'chassis';
  const [W, L] = gridOf(d);
  const [w, l] = footprint(def, r);
  if (x < 0 || z < 0 || x + w > W || z + l > L) return 'bounds';
  for (let i = x; i < x + w; i++)
    for (let k = z; k < z + l; k++) {
      const o = partAt(d, def.layer, i, k);
      if (o && o !== ignore) return 'busy';
    }
  switch (def.place) {
    case 'edge':
      if (x !== 0 && x + w !== W) return 'edge';
      break;
    case 'front':
      if (z !== 0) return 'front';
      break;
    case 'back':
      if (z + l !== L) return 'back';
      break;
    case 'ends':
      if (z !== 0 && z + l !== L) return 'ends';
      break;
    case 'center':
      if (Math.abs(x + w / 2 - W / 2) > 0.51) return 'center';
      break;
  }
  return null;
}
export function placeErrText(e: PlaceErr): string {
  switch (e) {
    case 'bounds': return t('mveic.pe.bounds', 'Não cabe aqui');
    case 'busy': return t('mveic.pe.busy', 'Já tem peça aqui');
    case 'edge': return t('mveic.pe.edge', 'Vai na beirada (lado)');
    case 'front': return t('mveic.pe.front', 'Vai na frente');
    case 'back': return t('mveic.pe.back', 'Vai atrás');
    case 'ends': return t('mveic.pe.ends', 'Vai na frente ou atrás');
    case 'center': return t('mveic.pe.center', 'Vai no meio');
    default: return t('mveic.pe.chassis', 'Escolha outro chassi na bandeja');
  }
}

/** coluna espelhada da pegada */
export function mirrorX(d: VehicleDesign, x: number, w: number): number {
  return gridOf(d)[0] - x - w;
}
const mirrorRot = (r: Rot): Rot => (r === 1 ? 3 : r === 3 ? 1 : r);

/**
 * Coloca a peça (e a cópia espelhada, se `sym` e couber). Devolve quantas foram colocadas
 * (0 = não coube; o motivo vem em `err`).
 */
export function place(d: VehicleDesign, id: string, x: number, z: number, r: Rot, sym: boolean, err?: { e: PlaceErr | null }): number {
  const e = canPlace(d, id, x, z, r);
  if (err) err.e = e;
  if (e) return 0;
  d.parts.push({ p: id, x, z, r });
  let n = 1;
  if (sym) {
    const def = PART.get(id)!;
    const [w] = footprint(def, r);
    const mx = mirrorX(d, x, w);
    if (mx !== x && !canPlace(d, id, mx, z, mirrorRot(r))) {
      d.parts.push({ p: id, x: mx, z, r: mirrorRot(r) });
      n++;
    }
  }
  return n;
}
/** remove a peça em (x, z) — tenta deck, depois under; espelha se `sym` */
export function removeAt(d: VehicleDesign, x: number, z: number, sym: boolean, layer?: 'deck' | 'under'): PlacedPart[] {
  const out: PlacedPart[] = [];
  const pp = (layer ? partAt(d, layer, x, z) : partAt(d, 'deck', x, z) ?? partAt(d, 'under', x, z)) ?? null;
  if (!pp) return out;
  d.parts.splice(d.parts.indexOf(pp), 1);
  out.push(pp);
  if (sym) {
    const def = PART.get(pp.p)!;
    const [w] = footprint(def, pp.r);
    const mx = mirrorX(d, pp.x, w);
    const twin = d.parts.find((o) => o.p === pp.p && o.x === mx && o.z === pp.z);
    if (twin) {
      d.parts.splice(d.parts.indexOf(twin), 1);
      out.push(twin);
    }
  }
  return out;
}
/** troca o chassi; peças que não cabem mais saem (e são devolvidas) */
export function setChassis(d: VehicleDesign, chassis: string): PlacedPart[] {
  d.chassis = chassis;
  const keep: PlacedPart[] = [];
  const out: PlacedPart[] = [];
  const all = d.parts;
  d.parts = keep;
  for (const pp of all) (canPlace(d, pp.p, pp.x, pp.z, pp.r) ? out : keep).push(pp);
  return out;
}
/** contagem de peças (inclui o chassi) — o que precisa ter no inventário para montar */
export function bill(d: VehicleDesign): Map<string, number> {
  const m = new Map<string, number>([[d.chassis, 1]]);
  for (const pp of d.parts) m.set(pp.p, (m.get(pp.p) ?? 0) + 1);
  return m;
}

/* ------------------------------ layout físico ------------------------------ */
export interface WheelSpot {
  x: number;
  y: number;
  z: number;
  radius: number;
  grip: number;
  steer: boolean;
  /** roda escondida de uma esteira (−1 = roda normal) */
  track: number;
  side: -1 | 0 | 1;
  part: PlacedPart;
}
export interface Spot {
  x: number;
  y: number;
  z: number;
  part: PlacedPart;
  def: PartDef;
  /** meia-largura/meio-comprimento da pegada (m) */
  hw: number;
  hl: number;
}
export interface Layout {
  W: number;
  L: number;
  hw: number;
  hl: number;
  wheels: WheelSpot[];
  /** tudo que fica no deck/embaixo, com centro local */
  spots: Spot[];
  cargo: Spot[];
  floats: Spot[];
  seat: Spot | null;
  /** ponto de engate (frente/trás) */
  hitchFront: Spot | null;
  hitchBack: Spot | null;
}
/** centro local de uma pegada */
function center(d: VehicleDesign, pp: PlacedPart, def: PartDef): { x: number; z: number; hw: number; hl: number } {
  const [W, L] = gridOf(d);
  const [w, l] = footprint(def, pp.r);
  return { x: (pp.x + w / 2) * CELL - (W * CELL) / 2, z: (pp.z + l / 2) * CELL - (L * CELL) / 2, hw: (w * CELL) / 2, hl: (l * CELL) / 2 };
}
export function layout(d: VehicleDesign): Layout {
  const [W, L] = gridOf(d);
  const hw = (W * CELL) / 2;
  const hl = (L * CELL) / 2;
  const out: Layout = { W, L, hw, hl, wheels: [], spots: [], cargo: [], floats: [], seat: null, hitchFront: null, hitchBack: null };
  let minWheelZ = Infinity;
  for (const pp of d.parts) {
    const def = PART.get(pp.p);
    if (!def) continue;
    const c = center(d, pp, def);
    const y = def.layer === 'under' ? -DECK_T : 0;
    const s: Spot = { x: c.x, y, z: c.z, part: pp, def, hw: c.hw, hl: c.hl };
    out.spots.push(s);
    if (def.cat === 'wheel') {
      const [w] = footprint(def, pp.r);
      const side: -1 | 0 | 1 = pp.x === 0 ? -1 : pp.x + w === W ? 1 : 0;
      const x = side === 0 ? c.x : side * (hw + 0.14);
      out.wheels.push({ x, y: -DECK_T, z: c.z, radius: def.radius!, grip: def.grip!, steer: false, track: -1, side, part: pp });
      minWheelZ = Math.min(minWheelZ, c.z);
    } else if (def.cat === 'track') {
      const side: -1 | 1 = c.x < 0 ? -1 : 1;
      const x = side * (hw + 0.18);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const z = c.z - c.hl + 0.3 + ((c.hl * 2 - 0.6) * i) / (n - 1);
        out.wheels.push({ x, y: -DECK_T, z, radius: def.radius!, grip: def.grip!, steer: false, track: out.spots.length - 1, side, part: pp });
      }
    } else if (def.cat === 'float') {
      const side = c.x < 0 ? -1 : 1;
      s.x = side * (hw + 0.1);
      out.floats.push(s);
    } else if (def.cat === 'cargo') out.cargo.push(s);
    else if (def.cat === 'seat' && !out.seat) out.seat = s;
    else if (def.cat === 'hitch') {
      if (pp.z === 0) out.hitchFront = s;
      else out.hitchBack = s;
    }
  }
  // dianteiras esterçam (se houver mais de uma fileira de rodas)
  const zs = new Set(out.wheels.filter((w) => w.track < 0).map((w) => w.z.toFixed(2)));
  if (zs.size > 1) for (const w of out.wheels) if (w.track < 0 && Math.abs(w.z - minWheelZ) < 0.01) w.steer = true;
  return out;
}

/* ------------------------------ ficha técnica e validação ------------------------------ */
export type VKind = 'land' | 'tracked' | 'water' | 'heli' | 'plane' | 'trailer';
export interface Analysis {
  ok: boolean;
  errors: string[];
  warnings: string[];
  kind: VKind;
  /** massa vazia (sem piloto/carga) */
  mass: number;
  power: number;
  fuel: FuelKind;
  tank: number;
  burn: number;
  /** m/s em plano, vazio */
  topSpeed: number;
  /** subida máxima (graus), vazio */
  climb: number;
  /** energia por minuto em velocidade de cruzeiro */
  fuelPerMin: number;
  /** alcance (m) com tanque cheio em cruzeiro (Infinity = pedal) */
  range: number;
  /** toras que cabem nas caçambas */
  cargo: number;
  /** pilhas de itens nos compartimentos */
  slots: number;
  hp: number;
  armor: number;
  buoy: number;
  grip: number;
  vmaxWheels: number;
  tier: number;
  tools: { crane: number; drill: number; blade: number; plow: number; lights: number; hitchF: boolean; hitchB: boolean; props: number; rotors: number; wings: number };
  /** peso suportado pelo guindaste */
  lift: number;
}

export function dragOf(widthM: number): number {
  return 0.3 + 0.25 * widthM;
}
/** força motriz disponível a uma velocidade */
export function driveForce(power: number, v: number): number {
  return (power * KP) / Math.max(Math.abs(v), V0);
}
/** velocidade de equilíbrio: potência = (rolagem + arrasto) × v */
export function solveTop(power: number, mass: number, cd: number, g = G_DEFAULT, crr = CRR): number {
  let v = 0.2;
  while (v < 60 && driveForce(power, v) > crr * mass * g + cd * v * v) v += 0.05;
  return v;
}
/** energia por segundo para uma potência mecânica entregue (F·v) */
export function burnRate(power: number, burn: number, mech: number): number {
  return burn * (mech / KP + 0.08 * power);
}

export function analyze(d: VehicleDesign, extraMass = 0): Analysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ch = PART.get(d.chassis);
  let mass = ch?.mass ?? 0;
  let hp = ch?.hp ?? 50;
  let tier = ch?.tier ?? 0;
  let power = 0;
  let tank = 0;
  let burnW = 0;
  let cargo = 0;
  let slots = 0;
  let armor = 0;
  let buoy = 0;
  let lift = 0;
  let nWheels = 0;
  let grip = 0;
  let vmaxW = Infinity;
  let seats = 0;
  const fuels = new Set<FuelKind>();
  const tracks = { l: 0, r: 0 };
  const tools = { crane: 0, drill: 0, blade: 0, plow: 0, lights: 0, hitchF: false, hitchB: false, props: 0, rotors: 0, wings: 0 };
  const lay = layout(d);
  let wingL = 0;
  let wingR = 0;
  for (const pp of d.parts) {
    const def = PART.get(pp.p);
    if (!def) continue;
    mass += def.mass;
    tier = Math.max(tier, def.tier);
    switch (def.cat) {
      case 'engine':
        power += def.power!;
        tank += def.tank!;
        burnW += def.burn! * def.power!;
        fuels.add(def.fuel!);
        break;
      case 'tank':
        tank += def.tank!;
        break;
      case 'wheel':
        nWheels++;
        grip += def.grip!;
        vmaxW = Math.min(vmaxW, def.vmax!);
        break;
      case 'track': {
        const c = center(d, pp, def);
        if (c.x < 0) tracks.l++;
        else tracks.r++;
        grip += def.grip! * 2;
        nWheels += 2;
        vmaxW = Math.min(vmaxW, def.vmax!);
        break;
      }
      case 'seat':
        seats++;
        break;
      case 'cargo':
        cargo += def.cap!;
        break;
      case 'box':
        slots += def.cap!;
        break;
      case 'armor':
        hp += def.hp!;
        armor += def.armor!;
        break;
      case 'float':
        buoy += def.buoy!;
        break;
      case 'crane':
        tools.crane++;
        lift += def.lift!;
        break;
      case 'drill':
        tools.drill++;
        break;
      case 'blade':
        tools.blade++;
        break;
      case 'plow':
        tools.plow++;
        break;
      case 'light':
        tools.lights++;
        break;
      case 'hitch':
        if (pp.z === 0) tools.hitchF = true;
        else tools.hitchB = true;
        break;
      case 'propeller':
        tools.props++;
        break;
      case 'rotor':
        tools.rotors++;
        break;
      case 'wing':
        if (center(d, pp, def).x < 0) wingL++;
        else wingR++;
        tools.wings++;
        break;
    }
  }
  armor = Math.min(0.6, armor);
  grip = nWheels ? grip / nWheels : 1;
  if (!isFinite(vmaxW)) vmaxW = 0;
  const fuel: FuelKind = fuels.size === 0 ? 'none' : fuels.has('bateria') ? 'bateria' : fuels.has('combustivel') ? 'combustivel' : fuels.has('carvao') ? 'carvao' : 'none';
  const burn = power > 0 ? burnW / power : 0;
  const hasTracks = tracks.l + tracks.r > 0;
  const trailer = power === 0 && seats === 0 && tools.hitchF;

  let kind: VKind = 'land';
  if (trailer) kind = 'trailer';
  else if (tools.rotors > 0) kind = 'heli';
  else if (tools.wings > 0) kind = 'plane';
  else if (hasTracks) kind = 'tracked';
  else if (nWheels === 0 && buoy > 0) kind = 'water';

  const total = mass + (trailer ? 0 : DRIVER) + extraMass;
  const widthM = lay.W * CELL;
  const cd = dragOf(widthM);
  const g = G_DEFAULT;
  let top = 0;
  let mech = 0;
  if (kind === 'land' || kind === 'tracked') {
    top = Math.min(solveTop(power, total, cd), vmaxW || 0);
    mech = (CRR * total * g + cd * top * top) * top;
  } else if (kind === 'water') {
    const cdw = cd * 6;
    top = power > 0 && tools.props > 0 ? solveTop(power * 0.7, total, cdw, g, 0) : 0;
    mech = cdw * top * top * top;
  } else if (kind === 'heli') {
    top = power > 0 ? Math.min(20, solveTop(power * 0.5, total, cd * 2, g, 0)) : 0;
    mech = power * KP * 0.75;
  } else if (kind === 'plane') {
    top = power > 0 && tools.props > 0 ? Math.min(30, solveTop(power, total, cd * 0.6, g, 0)) : 0;
    mech = (cd * 0.6 * top * top) * top;
  }
  const perSec = burnRate(power, burn, Math.min(mech, power * KP));
  const fuelPerMin = perSec * 60;
  const range = fuel === 'none' ? Infinity : perSec > 0 ? (tank / perSec) * top : 0;
  // subida: força a 2 m/s vs peso; limitada pela aderência
  let climb = 0;
  if (kind === 'land' || kind === 'tracked') {
    const f = driveForce(power, 2) / (total * g);
    const byPower = Math.asin(Math.max(0, Math.min(1, f - CRR)));
    const byGrip = Math.atan(grip * 0.75);
    climb = (Math.min(byPower, byGrip) * 180) / Math.PI;
  }

  // ---- validação ----
  if (!trailer) {
    if (seats === 0) errors.push(t('mveic.e.seat', 'Falta o banco do piloto'));
    if (power === 0) errors.push(t('mveic.e.engine', 'Falta um motor'));
    if (fuels.size > 1 && !(fuels.size === 2 && fuels.has('none'))) errors.push(t('mveic.e.mixFuel', 'Motores com combustíveis diferentes'));
  }
  const movers = nWheels + buoy + tools.rotors + tools.wings;
  if (movers === 0) errors.push(t('mveic.e.move', 'Falta rodas, esteiras, boias, rotor ou asas'));
  if (hasTracks && (tracks.l === 0 || tracks.r === 0)) errors.push(t('mveic.e.tracks', 'Esteiras vão em par: uma de cada lado'));
  if (!hasTracks && nWheels > 0 && nWheels < 3 && kind !== 'heli') errors.push(t('mveic.e.wheels', 'Precisa de pelo menos 3 rodas'));
  if (kind === 'water' || kind === 'plane') if (tools.props === 0) errors.push(t('mveic.e.prop', 'Precisa de uma hélice'));
  if (kind === 'water' && buoy < total * 1.2) errors.push(t('mveic.e.sink', 'Afunda! Ponha mais boias'));
  if (kind === 'plane' && wingL !== wingR) errors.push(t('mveic.e.wings', 'Asas vão em par: uma de cada lado'));
  if (kind === 'heli' && (fuel === 'none' || fuel === 'carvao' || power * KP * 0.2 < total * g * 1.25)) errors.push(t('mveic.e.rotor', 'O rotor precisa de motores fortes (elétrico ou a combustível)'));
  if (kind === 'plane' && fuel === 'none') errors.push(t('mveic.e.planeFuel', 'Avião precisa de motor de verdade'));
  if ((kind === 'land' || kind === 'tracked') && !trailer && power > 0 && climb < 6) errors.push(t('mveic.e.heavy', 'Pesado demais para o motor'));
  if (!trailer && lay.wheels.length > 0 && !lay.wheels.some((w) => w.steer) && !hasTracks && kind === 'land') warnings.push(t('mveic.w.steer', 'Rodas numa fileira só: vira devagar'));
  if (tools.drill + tools.blade > 0 && power < 8) warnings.push(t('mveic.w.toolPower', 'Ferramenta pesada para motor fraco'));
  if (buoy > 0 && kind !== 'water' && tools.props === 0) warnings.push(t('mveic.w.noProp', 'Boia sem hélice: só flutua'));

  return { ok: errors.length === 0, errors, warnings, kind, mass, power, fuel, tank, burn, topSpeed: top, climb, fuelPerMin, range, cargo, slots, hp, armor, buoy, grip, vmaxWheels: vmaxW, tier, tools, lift };
}

/* ------------------------------ serialização ------------------------------ */
export function encodeDesign(d: VehicleDesign): string {
  return JSON.stringify({ v: 1, id: d.id, name: d.name, chassis: d.chassis, paint: d.paint, parts: d.parts.map((p) => [p.p, p.x, p.z, p.r]) });
}
export function decodeDesign(s: string | object): VehicleDesign | null {
  try {
    const o = (typeof s === 'string' ? JSON.parse(s) : s) as { v?: number; id?: string; name?: string; chassis?: string; paint?: string; parts?: unknown[] };
    if (!o || o.v !== 1 || typeof o.chassis !== 'string' || !PART.has(o.chassis) || !Array.isArray(o.parts)) return null;
    const d: VehicleDesign = { v: 1, id: String(o.id || newDesign().id), name: String(o.name ?? '').slice(0, 40), chassis: o.chassis, paint: typeof o.paint === 'string' ? o.paint : PAINTS[0], parts: [] };
    for (const e of o.parts) {
      const a = Array.isArray(e) ? e : e && typeof e === 'object' ? [(e as PlacedPart).p, (e as PlacedPart).x, (e as PlacedPart).z, (e as PlacedPart).r] : null;
      if (!a) continue;
      const [p, x, z, r] = a as [string, number, number, number];
      if (!PART.has(p)) continue;
      const rr = ((r | 0) & 3) as Rot;
      if (!canPlace(d, p, x | 0, z | 0, rr)) d.parts.push({ p, x: x | 0, z: z | 0, r: rr });
    }
    return d;
  } catch {
    return null;
  }
}
