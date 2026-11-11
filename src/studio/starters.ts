/* ============================================================
 *  BLOOP STUDIO — criações iniciais feitas à mão (Equipe Bloop).
 *  Aparecem na Loja de Criações (mock) e servem de exemplo de tudo que o
 *  editor faz: veículos com rodas/propulsor, juntas com motor, fichas de
 *  lógica, percurso com checkpoint/chegada e traços da Caneta 3D.
 * ============================================================ */
import { t } from '../i18n';
import { FORMAT_VERSION, type Creation, type CreationKind, type Finish, type Joint, type LogicRule, type Part, type PartRole, type PhysMode, type PrimType, type Vec3, type WorldKind } from './format';
import type { StoreCategory } from './store-api';

export const TEAM = { id: 'bloop-team', name: 'Equipe Bloop' };

interface Extra {
  r?: Vec3;
  role?: PartRole;
  phys?: PhysMode;
  g?: number;
  name?: string;
  hide?: boolean;
}

class B {
  c: Creation;
  private n = 1;
  private mats = new Map<string, number>();
  constructor(id: string, kind: CreationKind, name: string, world?: WorldKind) {
    this.c = { v: FORMAT_VERSION, id, kind, name, author: TEAM.name, authorId: TEAM.id, parts: [], joints: [], logic: [], materials: [], worldKind: world, created: 1767225600000, updated: 1767225600000 };
  }
  m(c: string, k: Finish = 'plastic'): number {
    const key = c + k;
    let i = this.mats.get(key);
    if (i == null) {
      i = this.c.materials.length;
      this.c.materials.push({ c, k });
      this.mats.set(key, i);
    }
    return i;
  }
  add(t: PrimType, p: Vec3, s: Vec3, mat: number, e: Extra = {}): number {
    const id = this.n++;
    const part: Part = { id, t, p, s, m: mat || undefined, ...e };
    if (!part.m) delete part.m;
    this.c.parts.push(part);
    return id;
  }
  stroke(p: Vec3, pts: number[], w: number, mat: number): number {
    const id = this.n++;
    this.c.parts.push({ id, t: 'stroke', p, pts, w, m: mat });
    return id;
  }
  ref(refId: string, p: Vec3, e: Extra = {}): number {
    const id = this.n++;
    this.c.parts.push({ id, t: 'ref', ref: refId, p, ...e });
    return id;
  }
  joint(j: Omit<Joint, 'id'>): number {
    const id = this.c.joints.length + 1;
    this.c.joints.push({ id, ...j });
    return id;
  }
  rule(r: Omit<LogicRule, 'id'>): void {
    this.c.logic.push({ id: this.c.logic.length + 1, ...r });
  }
}

const WHEEL_R: Vec3 = [0, 0, 90];

function car(): Creation {
  const b = new B('st_car', 'vehicle', 'Carro Bolha');
  const pink = b.m('#ff5cc8');
  const tire = b.m('#2e2440', 'rubber');
  const rim = b.m('#dcd6f0', 'metal');
  const glass = b.m('#9fe8ff', 'glass');
  const light = b.m('#fff6b0', 'neon');
  const white = b.m('#f4efff');
  b.add('box', [0, 0.72, 0], [1.7, 0.5, 3.4], pink, { name: 'chassi' });
  b.add('capsule', [0, 0.72, -1.65], [0.5, 1.7, 0.5], pink, { r: [0, 0, 90] });
  b.add('box', [0, 1.25, 0.25], [1.5, 0.6, 1.6], glass);
  b.add('box', [0, 1.6, 0.25], [1.6, 0.12, 1.7], white);
  b.add('box', [0, 1.02, 0.35], [0.7, 0.18, 0.7], white, { role: 'seat', name: 'assento' });
  for (const x of [-0.95, 0.95])
    for (const z of [-1.15, 1.15]) {
      b.add('cylinder', [x, 0.42, z], [0.84, 0.34, 0.84], tire, { r: WHEEL_R, role: 'wheel' });
      b.add('cylinder', [x * 1.05, 0.42, z], [0.4, 0.3, 0.4], rim, { r: WHEEL_R, phys: 'none' });
    }
  b.add('sphere', [-0.55, 0.8, -1.72], [0.32, 0.32, 0.2], light, { phys: 'none' });
  b.add('sphere', [0.55, 0.8, -1.72], [0.32, 0.32, 0.2], light, { phys: 'none' });
  b.add('box', [0, 0.55, 1.72], [1.6, 0.25, 0.1], b.m('#ff4f6a', 'neon'), { phys: 'none' });
  return b.c;
}

function kart(): Creation {
  const b = new B('st_kart', 'vehicle', 'Kart Turbo');
  const body = b.m('#ffd34a');
  const tire = b.m('#2e2440', 'rubber');
  const dark = b.m('#3a2a5a');
  const metal = b.m('#c8ccd8', 'metal');
  b.add('box', [0, 0.38, 0], [1.2, 0.2, 2.2], body);
  b.add('wedge', [0, 0.52, -0.95], [1.1, 0.3, 0.5], body, { r: [0, 180, 0] });
  b.add('box', [0, 0.6, 0.35], [0.6, 0.25, 0.6], dark, { role: 'seat' });
  b.add('box', [0, 0.85, 0.66], [0.6, 0.5, 0.12], dark, { phys: 'none' });
  b.add('torus', [0, 0.85, -0.3], [0.4, 0.4, 0.4], dark, { r: [60, 0, 0], phys: 'none' });
  b.add('box', [0, 0.95, 1.05], [1.3, 0.08, 0.35], b.m('#ff5cc8'), { phys: 'none' });
  for (const x of [-0.45, 0.45]) b.add('cylinder', [x, 0.75, 1.05], [0.06, 0.4, 0.06], metal, { phys: 'none' });
  for (const x of [-0.7, 0.7])
    for (const z of [-0.75, 0.75]) b.add('cylinder', [x, 0.3, z], [0.6, 0.3, 0.6], tire, { r: WHEEL_R, role: 'wheel' });
  return b.c;
}

function truck(): Creation {
  const b = new B('st_truck', 'vehicle', 'Caminhão Forte');
  const blue = b.m('#5ec8ff');
  const tire = b.m('#2e2440', 'rubber');
  const glass = b.m('#9fe8ff', 'glass');
  const grey = b.m('#c8ccd8', 'metal');
  b.add('box', [0, 0.9, 0], [2, 0.4, 5.6], grey);
  b.add('box', [0, 1.75, -1.9], [2, 1.3, 1.6], blue);
  b.add('box', [0, 1.95, -2.72], [1.8, 0.7, 0.06], glass, { phys: 'none' });
  b.add('box', [0, 1.45, -1.7], [0.8, 0.2, 0.7], b.m('#f4efff'), { role: 'seat' });
  b.add('box', [0, 1.6, 1.0], [2, 1.0, 3.4], b.m('#ff9a2e'));
  for (const z of [-1.9, 0.9, 2.1])
    for (const x of [-1.05, 1.05]) b.add('cylinder', [x, 0.5, z], [1, 0.4, 1], tire, { r: WHEEL_R, role: 'wheel' });
  return b.c;
}

function rocket(): Creation {
  const b = new B('st_rocket', 'vehicle', 'Foguete Bloop');
  const white = b.m('#f4efff');
  const red = b.m('#ff4f6a');
  const glass = b.m('#9fe8ff', 'glass');
  const fire = b.m('#ffb02e', 'neon');
  b.add('cylinder', [0, 2.2, 0], [1.4, 3, 1.4], white);
  b.add('cone', [0, 4.3, 0], [1.4, 1.2, 1.4], red);
  b.add('sphere', [0, 2.9, -0.62], [0.6, 0.6, 0.2], glass, { phys: 'none' });
  b.add('box', [0, 2.3, 0], [0.6, 0.2, 0.6], white, { role: 'seat' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.add('wedge', [Math.cos(a) * 0.85, 1.0, Math.sin(a) * 0.85], [0.12, 1.2, 0.8], red, { r: [0, (-a * 180) / Math.PI + 90, 0] });
  }
  b.add('cone', [0, 0.45, 0], [0.9, 0.5, 0.9], b.m('#3a2a5a', 'metal'), { r: [180, 0, 0], role: 'thruster' });
  b.add('cone', [0, 0.05, 0], [0.6, 0.5, 0.6], fire, { r: [180, 0, 0], phys: 'none' });
  return b.c;
}

function house(): Creation {
  const b = new B('st_house', 'object', 'Casinha Doce');
  const wall = b.m('#ffe3f4');
  const roof = b.m('#ff5cc8');
  const wood = b.m('#a8742e', 'wood');
  const glass = b.m('#9fe8ff', 'glass');
  b.add('box', [0, 0.1, 0], [5.4, 0.2, 4.4], b.m('#c8ccd8'));
  b.add('box', [0, 1.6, 2], [5, 2.8, 0.25], wall);
  b.add('box', [-2.4, 1.6, 0], [0.25, 2.8, 4], wall);
  b.add('box', [2.4, 1.6, 0], [0.25, 2.8, 4], wall);
  b.add('box', [-1.6, 1.6, -2], [1.8, 2.8, 0.25], wall);
  b.add('box', [1.6, 1.6, -2], [1.8, 2.8, 0.25], wall);
  b.add('box', [0, 2.6, -2], [1.4, 0.8, 0.25], wall);
  b.add('box', [0, 1.1, -2.05], [1.4, 2, 0.12], wood, { name: 'porta' });
  b.add('box', [-1.6, 1.8, -2.1], [0.9, 0.8, 0.08], glass, { phys: 'none' });
  b.add('box', [1.6, 1.8, -2.1], [0.9, 0.8, 0.08], glass, { phys: 'none' });
  b.add('wedge', [0, 3.6, -1.15], [5.6, 1.4, 2.5], roof, { r: [0, 180, 0] });
  b.add('wedge', [0, 3.6, 1.15], [5.6, 1.4, 2.5], roof);
  b.add('box', [1.5, 3.9, 0.9], [0.5, 1.2, 0.5], b.m('#c8a8ff'));
  // a porta abre ao apertar a campainha
  const bell = b.add('sphere', [1.0, 1.5, -2.2], [0.22, 0.22, 0.22], b.m('#ffd34a', 'neon'), { role: 'button' });
  b.rule({ on: { k: 'button', part: bell }, do: [{ k: 'door', part: 8 }, { k: 'sound', snd: 'ding' }] });
  return b.c;
}

function treeHouse(): Creation {
  const b = new B('st_treehouse', 'object', 'Casa na Árvore');
  const bark = b.m('#8a5a34', 'wood');
  const leaf = b.m('#4fae5a');
  const plank = b.m('#c8945a', 'wood');
  const roof = b.m('#ff8a2e');
  b.add('cylinder', [0, 3, 0], [1.2, 6, 1.2], bark);
  b.add('sphere', [0, 7.2, 0], [5, 3.6, 5], leaf);
  b.add('sphere', [1.8, 6.5, 1.2], [3, 2.4, 3], leaf);
  b.add('sphere', [-1.6, 6.8, -1.4], [3, 2.4, 3], leaf);
  b.add('box', [0, 3.6, 0], [4, 0.25, 4], plank);
  b.add('box', [0, 4.6, 1.85], [3.6, 1.8, 0.15], plank);
  b.add('box', [-1.85, 4.6, 0], [0.15, 1.8, 3.6], plank);
  b.add('box', [1.85, 4.6, 0], [0.15, 1.8, 3.6], plank);
  b.add('wedge', [0, 6.0, 0.95], [4.2, 1.0, 2.1], roof);
  b.add('wedge', [0, 6.0, -0.95], [4.2, 1.0, 2.1], roof, { r: [0, 180, 0] });
  for (let i = 0; i < 7; i++) b.add('box', [0, 0.35 + i * 0.5, -2.2 - i * 0.3], [1, 0.12, 0.45], plank);
  return b.c;
}

function bridge(): Creation {
  const b = new B('st_bridge', 'object', 'Ponte Arco-Íris');
  const cols = ['#ff4f6a', '#ff9a2e', '#ffd34a', '#4fd67a', '#5ec8ff', '#8a5cff'];
  for (let i = 0; i < 12; i++) b.add('box', [0, 1.6 + Math.sin((i / 11) * Math.PI) * 1.2, -5.5 + i], [3, 0.2, 0.95], b.m(cols[i % 6]));
  for (const x of [-1.6, 1.6]) {
    b.add('arch', [x, 1.2, 0], [0.2, 2.4, 12], b.m('#f4efff'), { r: [0, 90, 0] });
    b.add('pipe', [x, 3.1, 0], [0.12, 11, 0.12], b.m('#c8ccd8', 'metal'), { r: [90, 0, 0] });
  }
  return b.c;
}

function catapult(): Creation {
  const b = new B('st_catapult', 'object', 'Catapulta de Bolinhas');
  const wood = b.m('#a8742e', 'wood');
  const dark = b.m('#6a4a2a', 'wood');
  b.add('box', [0, 0.25, 0], [2.4, 0.5, 3.4], wood);
  b.add('box', [-0.9, 1.1, 0.2], [0.3, 1.4, 0.3], dark);
  b.add('box', [0.9, 1.1, 0.2], [0.3, 1.4, 0.3], dark);
  const arm = b.add('box', [0, 1.75, 0.6], [0.3, 0.2, 2.6], dark, { phys: 'dynamic', g: 1 });
  b.add('pipe', [0, 1.95, 1.7], [0.8, 0.3, 0.8], wood, { phys: 'dynamic', g: 1 });
  b.add('sphere', [0, 2.3, 1.7], [0.5, 0.5, 0.5], b.m('#ff5cc8'), { phys: 'dynamic' });
  const hinge = b.joint({ k: 'hinge', a: arm, b: 0, at: [0, 1.75, 0.2], axis: [1, 0, 0], lim: [-70, 0], motor: { speed: -9, force: 600, on: false } });
  const btn = b.add('cylinder', [1.4, 0.6, -1.2], [0.5, 0.2, 0.5], b.m('#ff4f6a', 'neon'), { role: 'button' });
  b.rule({ on: { k: 'button', part: btn }, do: [{ k: 'motor', joint: hinge }, { k: 'sound', snd: 'whoosh' }] });
  return b.c;
}

function chair(): Creation {
  const b = new B('st_chair', 'object', 'Cadeira Fofa');
  const w = b.m('#a8742e', 'wood');
  const pad = b.m('#ff8fd8');
  for (const x of [-0.25, 0.25]) for (const z of [-0.25, 0.25]) b.add('cylinder', [x, 0.25, z], [0.08, 0.5, 0.08], w);
  b.add('box', [0, 0.55, 0], [0.65, 0.1, 0.65], w);
  b.add('box', [0, 0.64, 0], [0.6, 0.08, 0.6], pad);
  b.add('box', [0, 1.0, 0.3], [0.65, 0.8, 0.08], w);
  b.add('capsule', [0, 1.4, 0.3], [0.2, 0.75, 0.2], pad, { r: [0, 0, 90] });
  return b.c;
}

function table(): Creation {
  const b = new B('st_table', 'object', 'Mesa de Piquenique');
  const w = b.m('#c8945a', 'wood');
  b.add('box', [0, 0.75, 0], [2, 0.1, 1], w);
  for (const x of [-0.8, 0.8]) b.add('box', [x, 0.37, 0], [0.1, 0.74, 0.9], w);
  for (const z of [-0.75, 0.75]) b.add('box', [0, 0.45, z], [2, 0.08, 0.35], w);
  b.add('cylinder', [0.3, 0.88, 0], [0.3, 0.15, 0.3], b.m('#ff4f6a'));
  return b.c;
}

function lamp(): Creation {
  const b = new B('st_lamp', 'object', 'Poste de Luz');
  const metal = b.m('#5a4a7a', 'metal');
  b.add('cylinder', [0, 0.1, 0], [0.6, 0.2, 0.6], metal);
  b.add('cylinder', [0, 1.6, 0], [0.12, 3, 0.12], metal);
  b.add('torus', [0, 3.0, 0], [0.4, 0.4, 0.4], metal, { r: [90, 0, 0] });
  b.add('sphere', [0, 3.35, 0], [0.55, 0.55, 0.55], b.m('#fff6b0', 'glass'), { role: 'light' });
  return b.c;
}

function treeRound(): Creation {
  const b = new B('st_tree', 'object', 'Árvore Bolota');
  b.add('cylinder', [0, 1.2, 0], [0.5, 2.4, 0.5], b.m('#8a5a34', 'wood'));
  const l = b.m('#4fd67a');
  b.add('sphere', [0, 3, 0], [2.6, 2.2, 2.6], l);
  b.add('sphere', [0.7, 3.7, 0.3], [1.4, 1.3, 1.4], l);
  b.add('sphere', [-0.6, 2.5, 0.8], [1.2, 1.1, 1.2], l);
  for (let i = 0; i < 4; i++) b.add('sphere', [Math.cos(i * 1.7) * 1.1, 2.6 + (i % 2) * 0.8, Math.sin(i * 1.7) * 1.1], [0.25, 0.25, 0.25], b.m('#ff4f6a'), { phys: 'none' });
  return b.c;
}

function pine(): Creation {
  const b = new B('st_pine', 'object', 'Pinheiro de Neve');
  b.add('cylinder', [0, 0.6, 0], [0.4, 1.2, 0.4], b.m('#8a5a34', 'wood'));
  const g = b.m('#3f8a76');
  const s = b.m('#f6f9ff');
  for (let i = 0; i < 3; i++) {
    b.add('cone', [0, 1.6 + i * 1.1, 0], [2.6 - i * 0.7, 1.8, 2.6 - i * 0.7], g);
    b.add('cone', [0, 2.05 + i * 1.1, 0], [1.2 - i * 0.3, 0.8, 1.2 - i * 0.3], s, { phys: 'none' });
  }
  b.add('sphere', [0, 4.9, 0], [0.4, 0.4, 0.4], b.m('#ffd34a', 'neon'), { phys: 'none' });
  return b.c;
}

function seesaw(): Creation {
  const b = new B('st_seesaw', 'object', 'Gangorra');
  const base = b.m('#8a5cff');
  b.add('wedge', [0, 0.35, 0.25], [0.6, 0.7, 0.5], base);
  b.add('wedge', [0, 0.35, -0.25], [0.6, 0.7, 0.5], base, { r: [0, 180, 0] });
  const plank = b.add('box', [0, 0.8, 0], [0.5, 0.12, 4.2], b.m('#ffd34a'), { phys: 'dynamic', g: 1 });
  b.add('box', [0, 0.95, 1.8], [0.5, 0.2, 0.4], b.m('#ff5cc8'), { phys: 'dynamic', g: 1 });
  b.add('box', [0, 0.95, -1.8], [0.5, 0.2, 0.4], b.m('#5ec8ff'), { phys: 'dynamic', g: 1 });
  b.joint({ k: 'hinge', a: plank, b: 0, at: [0, 0.75, 0], axis: [1, 0, 0], lim: [-15, 15] });
  return b.c;
}

function windmill(): Creation {
  const b = new B('st_windmill', 'object', 'Moinho Giratório');
  const wall = b.m('#f4efff');
  b.add('cylinder', [0, 2.5, 0], [2.4, 5, 2.4], wall);
  b.add('cone', [0, 5.6, 0], [2.8, 1.4, 2.8], b.m('#ff4f6a'));
  const hub = b.add('cylinder', [0, 4, -1.4], [0.5, 0.4, 0.5], b.m('#3a2a5a'), { r: [90, 0, 0], phys: 'dynamic', g: 1 });
  const blade = b.m('#a8742e', 'wood');
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    b.add('box', [Math.cos(a) * 1.6, 4 + Math.sin(a) * 1.6, -1.55], [0.5, 2.6, 0.08], blade, { r: [0, 0, (a * 180) / Math.PI + 90], phys: 'dynamic', g: 1 });
  }
  b.joint({ k: 'hinge', a: hub, b: 0, at: [0, 4, -1.4], axis: [0, 0, 1], motor: { speed: 1.2, force: 400 } });
  b.add('box', [0, 1, -1.22], [0.9, 1.6, 0.1], b.m('#8a5a34', 'wood'));
  return b.c;
}

function tower(): Creation {
  const b = new B('st_tower', 'object', 'Torre do Castelo');
  const st = b.m('#b8b4c8');
  const dk = b.m('#8a86a0');
  b.add('cylinder', [0, 3, 0], [3.2, 6, 3.2], st);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add('box', [Math.cos(a) * 1.5, 6.3, Math.sin(a) * 1.5], [0.6, 0.6, 0.6], dk);
  }
  b.add('arch', [0, 1.1, -1.55], [1.4, 2.2, 0.3], dk);
  b.add('cone', [0, 7.6, 0], [2.4, 2.4, 2.4], b.m('#8a5cff'));
  b.add('box', [0.35, 9.3, 0], [0.7, 0.4, 0.05], b.m('#ffd34a'), { phys: 'none' });
  b.add('cylinder', [0, 9, 0], [0.06, 1.2, 0.06], b.m('#c8ccd8', 'metal'), { phys: 'none' });
  return b.c;
}

function elevator(): Creation {
  const b = new B('st_elevator', 'object', 'Elevador Sobe-Desce');
  const frame = b.m('#c8ccd8', 'metal');
  for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) b.add('box', [x, 3, z], [0.2, 6, 0.2], frame);
  b.add('box', [0, 6.1, 0], [2.8, 0.2, 2.8], frame);
  const plat = b.add('box', [0, 0.2, 0], [2.3, 0.2, 2.3], b.m('#4fd67a'), { phys: 'dynamic', g: 1 });
  b.add('box', [0, 0.45, 1.1], [2.3, 0.3, 0.1], b.m('#ffd34a'), { phys: 'dynamic', g: 1 });
  b.joint({ k: 'slider', a: plat, b: 0, at: [0, 0.2, 0], axis: [0, 1, 0], lim: [0, 5.6], motor: { speed: 1.2 } });
  return b.c;
}

function fountain(): Creation {
  const b = new B('st_fountain', 'object', 'Fonte dos Desejos');
  const st = b.m('#dcd6f0');
  b.add('pipe', [0, 0.35, 0], [3.4, 0.7, 3.4], st);
  b.add('cylinder', [0, 0.3, 0], [3, 0.4, 3], b.m('#5ec8ff', 'glass'), { phys: 'none' });
  b.add('cylinder', [0, 1.0, 0], [0.5, 2, 0.5], st);
  b.add('torus', [0, 1.9, 0], [1.6, 1.6, 1.6], st, { r: [90, 0, 0] });
  b.add('sphere', [0, 2.3, 0], [0.6, 0.6, 0.6], b.m('#9fe8ff', 'neon'), { phys: 'none' });
  return b.c;
}

function sculpture(): Creation {
  const b = new B('st_doodle', 'object', 'Rabisco Espiral');
  const cols = ['#ff5cc8', '#5ec8ff', '#ffd34a'];
  for (let k = 0; k < 3; k++) {
    const pts: number[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = i * 0.32 + (k * Math.PI * 2) / 3;
      const r = 0.4 + i * 0.012;
      pts.push(Math.round(Math.cos(a) * r * 100) / 100, Math.round(i * 0.05 * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100);
    }
    b.stroke([0, 0.3, 0], pts, 0.07, b.m(cols[k], k === 1 ? 'neon' : 'plastic'));
  }
  b.add('cylinder', [0, 0.15, 0], [1.6, 0.3, 1.6], b.m('#3a2a5a'));
  return b.c;
}

function course(): Creation {
  const b = new B('st_course', 'map', 'Percurso do Botão', 'flat');
  const pad = b.m('#f4efff');
  const plat = b.m('#8a5cff');
  const plat2 = b.m('#5ec8ff');
  const lava = b.m('#ff5a2e', 'neon');
  b.add('box', [0, 0.05, -21], [18, 0.1, 54], lava, { role: 'hazard', name: 'lava' });
  b.add('box', [0, 0.5, 0], [6, 1, 6], pad);
  b.add('cylinder', [0, 1.06, 0], [1.6, 0.12, 1.6], b.m('#4fd67a'), { role: 'spawn' });
  b.add('box', [0, 0.5, -6.5], [2.6, 1, 2.6], plat);
  b.add('box', [1.6, 0.5, -10.6], [2.6, 1, 2.6], plat2);
  b.add('box', [0, 1, -14.6], [3, 2, 3], plat);
  b.add('box', [0, 1, -22], [6, 2, 10], plat2);
  // parede com porta e botão
  const wall = b.m('#ffe3f4');
  b.add('box', [-2.05, 3.5, -24], [1.9, 3, 0.4], wall);
  b.add('box', [2.05, 3.5, -24], [1.9, 3, 0.4], wall);
  b.add('box', [0, 4.6, -24], [2.2, 0.8, 0.4], wall);
  const door = b.add('box', [0, 3.1, -24], [2.2, 2.2, 0.25], b.m('#a8742e', 'wood'), { name: 'porta' });
  b.add('box', [2.2, 2.3, -20], [0.8, 0.6, 0.8], b.m('#3a2a5a'));
  const btn = b.add('cylinder', [2.2, 2.7, -20], [0.6, 0.2, 0.6], b.m('#ff4f6a', 'neon'), { role: 'button', name: 'botão' });
  b.rule({ on: { k: 'button', part: btn }, do: [{ k: 'door', part: door }, { k: 'sound', snd: 'ding' }, { k: 'score', n: 10 }] });
  b.add('box', [0, 2.06, -26], [2, 0.12, 2], b.m('#ffd34a'), { role: 'checkpoint' });
  // giratório
  b.add('box', [0, 1, -33], [7, 2, 8], plat);
  b.add('cylinder', [0, 2.5, -33], [0.5, 1, 0.5], b.m('#3a2a5a'));
  const bar = b.add('box', [0, 2.75, -33], [6.2, 0.35, 0.35], b.m('#ff5cc8'), { phys: 'dynamic' });
  b.joint({ k: 'hinge', a: bar, b: 0, at: [0, 2.75, -33], axis: [0, 1, 0], motor: { speed: 1.4, force: 2000 } });
  // chegada
  b.add('box', [0, 1, -41], [4, 2, 4], plat2);
  b.add('box', [0, 2.06, -41], [3, 0.12, 3], b.m('#4fd67a', 'neon'), { role: 'goal' });
  b.add('cylinder', [-1.3, 3.5, -42.2], [0.14, 3, 0.14], b.m('#c8ccd8', 'metal'), { phys: 'none' });
  b.add('box', [-0.75, 4.6, -42.2], [1.0, 0.7, 0.05], b.m('#ffd34a'), { phys: 'none' });
  b.c.game = { title: 'Percurso do Botão', desc: 'Pule nas plataformas, aperte o botão para abrir a porta e desvie do giratório até a chegada!', tags: ['obstaculos', 'aventura'], maxPlayers: 8 };
  return b.c;
}

/** minigame feito só com Blocos de lógica: moedas, vidas, tempo e plataforma que gira */
function coinHunt(): Creation {
  const b = new B('st_coins', 'map', 'Caça às Moedas', 'flat');
  const grass = b.m('#7ccf62');
  const plat = b.m('#8a5cff');
  const gold = b.m('#ffd34a', 'metal');
  const lava = b.m('#ff5a2e', 'neon');
  b.add('box', [0, 0.05, -10], [40, 0.1, 40], lava, { role: 'hazard' });
  b.add('box', [0, 0.5, 6], [8, 1, 6], grass);
  b.add('cylinder', [0, 1.06, 6], [1.4, 0.12, 1.4], b.m('#4fd67a'), { role: 'spawn' });
  const spots: [number, number, number][] = [
    [0, 1, -1], [5, 1.5, -4], [9, 2, -9], [4, 2.5, -14], [-3, 2.5, -16], [-8, 2, -11], [-7, 1.5, -5], [0, 3, -9],
  ];
  const coins: number[] = [];
  for (const [x, y, z] of spots) {
    b.add('box', [x, y - 0.5, z], [3.2, 1, 3.2], plat);
    coins.push(b.add('cylinder', [x, y + 0.6, z], [0.7, 0.12, 0.7], gold, { r: [90, 0, 0], role: 'collect', name: 'moeda' }));
  }
  const spinner = b.add('box', [0, 3.05, -9], [3.4, 0.25, 0.8], b.m('#ff5cc8'), { name: 'giratório' });
  b.c.scripts = [
    { id: 1, on: { k: 'start' }, body: [{ k: 'lives', n: 3 }, { k: 'set', v: 'moedas', e: 0 }, { k: 'say', text: 'Pegue 8 moedas! Você tem {lives} vidas' }] },
    { id: 2, on: { k: 'collect' }, body: [{ k: 'change', v: 'moedas', e: 1 }, { k: 'score', n: 10 }, { k: 'sound', snd: 'ding' }, { k: 'say', text: 'Moedas: {moedas}/8' }, { k: 'if', c: { op: '>=', a: { v: 'moedas' }, b: 8 }, then: [{ k: 'sound', snd: 'fanfare' }, { k: 'match', on: 'win' }] }] },
    { id: 3, on: { k: 'every', sec: 1 }, body: [{ k: 'rotate', part: spinner, r: [0, 60, 0], t: 1 }] },
    { id: 4, on: { k: 'die' }, body: [{ k: 'say', text: 'Ai! Restam {lives} vidas' }] },
  ];
  b.c.game = { title: 'Caça às Moedas', desc: 'Pule de plataforma em plataforma e pegue as 8 moedas sem cair na lava. 3 vidas!', tags: ['coleta', 'obstaculos'], maxPlayers: 4 };
  void coins;
  return b.c;
}

function rampPark(kartC: Creation): Creation {
  const b = new B('st_rampark', 'map', 'Parque de Rampas', 'flat');
  const r1 = b.m('#ff9a2e');
  const r2 = b.m('#5ec8ff');
  b.add('box', [0, 0.05, 0], [3, 0.1, 3], b.m('#4fd67a'), { role: 'spawn' });
  b.add('ramp', [0, 1, -14], [6, 2, 6], r1, { r: [0, 180, 0] });
  b.add('box', [0, 1, -20], [6, 2, 6], r1);
  b.add('ramp', [0, 1, -26], [6, 2, 6], r1);
  b.add('wedge', [12, 0.75, -8], [5, 1.5, 6], r2, { r: [0, 180, 0] });
  b.add('pipe', [-12, 2, -10], [5, 10, 5], b.m('#8a5cff'), { r: [90, 0, 0] });
  for (let i = 0; i < 8; i++) b.add('cylinder', [-6 + i * 1.7, 0.4, 6], [0.5, 0.8, 0.5], b.m(i % 2 ? '#ff4f6a' : '#f4efff'), { phys: 'dynamic' });
  b.ref(kartC.id, [4, 0, 2]);
  b.c.deps = [kartC];
  return b.c;
}

export interface StarterMeta {
  c: Creation;
  category: StoreCategory;
  likes: number;
  uses: number;
}

let cached: StarterMeta[] | null = null;
export function starters(): StarterMeta[] {
  if (cached) return cached;
  const k = kart();
  const list: [Creation, StoreCategory, number, number][] = [
    [car(), 'vehicles', 812, 540],
    [k, 'vehicles', 655, 410],
    [rocket(), 'vehicles', 990, 702],
    [truck(), 'vehicles', 344, 198],
    [house(), 'buildings', 520, 388],
    [treeHouse(), 'buildings', 740, 466],
    [tower(), 'buildings', 301, 170],
    [bridge(), 'buildings', 288, 260],
    [catapult(), 'gadgets', 870, 515],
    [seesaw(), 'gadgets', 230, 140],
    [windmill(), 'gadgets', 410, 233],
    [elevator(), 'gadgets', 266, 120],
    [chair(), 'furniture', 150, 220],
    [table(), 'furniture', 122, 180],
    [lamp(), 'furniture', 205, 260],
    [treeRound(), 'nature', 330, 610],
    [pine(), 'nature', 298, 480],
    [fountain(), 'nature', 188, 150],
    [sculpture(), 'art', 260, 90],
    [course(), 'maps', 1220, 0],
    [coinHunt(), 'maps', 980, 0],
    [rampPark(k), 'maps', 640, 0],
  ];
  cached = list.map(([c, category, likes, uses]) => ({ c, category, likes, uses }));
  return cached;
}

/** nome traduzido de uma criação inicial (as do jogador ficam como foram escritas) */
export function starterName(id: string, fallback: string): string {
  const N: Record<string, () => string> = {
    st_car: () => t('studio.st.car', 'Carro Bolha'),
    st_kart: () => t('studio.st.kart', 'Kart Turbo'),
    st_truck: () => t('studio.st.truck', 'Caminhão Forte'),
    st_rocket: () => t('studio.st.rocket', 'Foguete Bloop'),
    st_house: () => t('studio.st.house', 'Casinha Doce'),
    st_treehouse: () => t('studio.st.treehouse', 'Casa na Árvore'),
    st_bridge: () => t('studio.st.bridge', 'Ponte Arco-Íris'),
    st_catapult: () => t('studio.st.catapult', 'Catapulta de Bolinhas'),
    st_chair: () => t('studio.st.chair', 'Cadeira Fofa'),
    st_table: () => t('studio.st.table', 'Mesa de Piquenique'),
    st_lamp: () => t('studio.st.lamp', 'Poste de Luz'),
    st_tree: () => t('studio.st.tree', 'Árvore Bolota'),
    st_pine: () => t('studio.st.pine', 'Pinheiro de Neve'),
    st_seesaw: () => t('studio.st.seesaw', 'Gangorra'),
    st_windmill: () => t('studio.st.windmill', 'Moinho Giratório'),
    st_tower: () => t('studio.st.tower', 'Torre do Castelo'),
    st_elevator: () => t('studio.st.elevator', 'Elevador Sobe-Desce'),
    st_fountain: () => t('studio.st.fountain', 'Fonte dos Desejos'),
    st_doodle: () => t('studio.st.doodle', 'Rabisco Espiral'),
    st_course: () => t('studio.st.course', 'Percurso do Botão'),
    st_rampark: () => t('studio.st.rampark', 'Parque de Rampas'),
    st_coins: () => t('studio.st.coins', 'Caça às Moedas'),
  };
  return N[id]?.() ?? fallback;
}
