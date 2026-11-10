/* ============================================================
 *  CAVA & FALA — ENGENHOCAS (sistema determinístico de receitas).
 *  Cada engenhoca = BASE (lista de peças) + MÓDULOS (rodas, mola,
 *  hélice, foguete, luz, bolhas, ímã, espuma, gelo, confete) +
 *  MODIFICADORES (grande, pequeno, gigante, duplo, rápido, de ouro,
 *  de cristal, de pedra...). O custo sai dos materiais cavados e o
 *  modelo é montado peça por peça (animação de construção).
 *  Nada de IA generativa: só tabelas e regras.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { M, type Inv } from './data';
import { lam } from './bloop';

export type GKind = 'struct' | 'tool' | 'weapon' | 'vehicle';
export type Beh =
  | 'bridge' | 'stairs' | 'ramp' | 'trampoline' | 'wall' | 'tower' | 'platform' | 'catapult' | 'fan' | 'teleport' | 'pump' | 'slide' | 'jelly' | 'shelter' | 'lamp' | 'elevator' | 'fence' | 'block' | 'decoy'
  | 'balloon' | 'umbrella' | 'jetpack' | 'hook' | 'drill' | 'shovel' | 'shield' | 'magnet' | 'spring' | 'flashlight' | 'watering' | 'rocket' | 'digbot'
  | 'foam' | 'bubble' | 'snow' | 'confetti' | 'tornado' | 'glove' | 'hammer' | 'digbomb' | 'cart';

export type ModuleId = 'rodas' | 'mola' | 'helice' | 'foguete' | 'luz' | 'bolhas' | 'ima' | 'espuma' | 'gelo' | 'confete';

/** peça: forma, dimensões, posição, rotação, cor (papel ou #hex) */
export interface Part {
  s: 'box' | 'cyl' | 'sph' | 'cone' | 'torus' | 'cap';
  d: number[];
  p: [number, number, number];
  r?: [number, number, number];
  c: string;
  /** gira (hélice, pás do ventilador) */
  spin?: 'x' | 'y' | 'z';
  glow?: number;
  glass?: boolean;
}

export interface GDef {
  id: string;
  name: () => string;
  desc: () => string;
  kind: GKind;
  beh: Beh;
  /** sinônimos (pt-BR, inglês, um pouco de espanhol) — já sem acento */
  words: string[];
  cost: Partial<Record<number, number>>;
  main: string;
  acc: string;
  parts: () => Part[];
  /** feito de terra do próprio mapa (cresce do chão) */
  terrain?: boolean;
  /** os bots da arena sabem fazer */
  arena?: boolean;
  /** usos (consumível); 0 = infinito */
  uses?: number;
  /** mostra no início (receitas "descobertas") */
  starter?: boolean;
}

/* ------------------------------ ajudantes ------------------------------ */
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: string, r?: [number, number, number], extra: Partial<Part> = {}): Part => ({ s: 'box', d: [w, h, d], p: [x, y, z], r, c, ...extra });
const Cy = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: string, r?: [number, number, number], extra: Partial<Part> = {}): Part => ({ s: 'cyl', d: [rt, rb, h], p: [x, y, z], r, c, ...extra });
const S = (rad: number, x: number, y: number, z: number, c: string, sc?: [number, number, number], extra: Partial<Part> = {}): Part => ({ s: 'sph', d: [rad, ...(sc ?? [1, 1, 1])], p: [x, y, z], c, ...extra });
const K = (rad: number, h: number, x: number, y: number, z: number, c: string, r?: [number, number, number], extra: Partial<Part> = {}): Part => ({ s: 'cone', d: [rad, h], p: [x, y, z], r, c, ...extra });
const T = (R: number, tube: number, x: number, y: number, z: number, c: string, r?: [number, number, number], extra: Partial<Part> = {}): Part => ({ s: 'torus', d: [R, tube], p: [x, y, z], r, c, ...extra });
const PI = Math.PI;
const H = PI / 2;

const wheel = (x: number, y: number, z: number, rad = 0.3): Part[] => [Cy(rad, rad, 0.16, x, y, z, 'dark', [0, 0, H]), Cy(rad * 0.45, rad * 0.45, 0.18, x, y, z, 'metal', [0, 0, H])];

/* ------------------------------ catálogo ------------------------------ */
export const GADGETS: GDef[] = [
  {
    id: 'ponte', kind: 'struct', beh: 'bridge', main: '#b07a40', acc: '#ffd34a', starter: true,
    name: () => t('cavafala.g.ponte', 'Ponte'), desc: () => t('cavafala.gd.ponte', 'Atravessa buracos e ravinas'),
    words: ['ponte', 'bridge', 'puente', 'passarela', 'pinguela', 'pontezinha'],
    cost: { [M.Terra]: 30, [M.Pedra]: 8 },
    parts: () => {
      const p: Part[] = [];
      for (let i = 0; i < 10; i++) p.push(B(2.2, 0.16, 0.56, 0, 0, -0.3 - i * 0.6, i % 3 === 1 ? 'acc2' : 'main'));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) p.push(Cy(0.07, 0.08, 0.9, s * 1.05, 0.45, -0.3 - i * 1.8, 'wood'));
        p.push(B(0.1, 0.1, 6, s * 1.05, 0.88, -3, 'acc'));
      }
      return p;
    },
  },
  {
    id: 'escada', kind: 'struct', beh: 'stairs', main: '#c8714a', acc: '#ffffff', starter: true,
    name: () => t('cavafala.g.escada', 'Escada'), desc: () => t('cavafala.gd.escada', 'Sobe em lugares altos'),
    words: ['escada', 'stairs', 'ladder', 'escadaria', 'degraus', 'degrau', 'escalera', 'staircase'],
    cost: { [M.Terra]: 22, [M.Argila]: 8 },
    parts: () => {
      const p: Part[] = [];
      for (let i = 0; i < 8; i++) p.push(B(1.6, 0.42, 0.56, 0, 0.21 + i * 0.42, -0.4 - i * 0.52, i % 2 ? 'main' : 'acc2'));
      for (const s of [-1, 1]) p.push(B(0.12, 0.12, 4.6, s * 0.86, 2.4, -2.2, 'acc', [0.68, 0, 0]));
      return p;
    },
  },
  {
    id: 'rampa', kind: 'struct', beh: 'ramp', main: '#ff8a3a', acc: '#ffffff',
    name: () => t('cavafala.g.rampa', 'Rampa'), desc: () => t('cavafala.gd.rampa', 'Uma ladeira para subir ou dar um salto'),
    words: ['rampa', 'ramp', 'ladeira', 'rampinha', 'skate ramp', 'trampolim de skate'],
    cost: { [M.Terra]: 18, [M.Areia]: 6 },
    parts: () => [B(2.4, 0.22, 4.2, 0, 1.0, -2.1, 'main', [0.5, 0, 0]), B(2.4, 0.08, 0.3, 0, 1.92, -3.95, 'acc', [0.5, 0, 0]), B(0.2, 1.9, 0.2, -1, 0.95, -3.6, 'wood'), B(0.2, 1.9, 0.2, 1, 0.95, -3.6, 'wood'), B(0.2, 1, 0.2, -1, 0.5, -1.9, 'wood'), B(0.2, 1, 0.2, 1, 0.5, -1.9, 'wood')],
  },
  {
    id: 'trampolim', kind: 'struct', beh: 'trampoline', main: '#3ab0ff', acc: '#ff4f6a', starter: true, arena: true,
    name: () => t('cavafala.g.trampolim', 'Trampolim'), desc: () => t('cavafala.gd.trampolim', 'Pula muuuito alto'),
    words: ['trampolim', 'trampoline', 'cama elastica', 'pula pula', 'trampolin', 'bounce pad', 'pulapula'],
    cost: { [M.Argila]: 14, [M.Terra]: 10 },
    parts: () => {
      const p: Part[] = [T(1.1, 0.12, 0, 0.55, -1.6, 'acc', [H, 0, 0]), Cy(1.02, 1.02, 0.06, 0, 0.55, -1.6, 'main')];
      for (let i = 0; i < 4; i++) p.push(Cy(0.06, 0.06, 0.55, Math.cos(i * H + 0.78) * 1, 0.27, -1.6 + Math.sin(i * H + 0.78) * 1, 'metal'));
      return p;
    },
  },
  {
    id: 'muralha', kind: 'struct', beh: 'wall', main: '#9a6a3f', acc: '#8d8f99', terrain: true, arena: true,
    name: () => t('cavafala.g.muralha', 'Muralha'), desc: () => t('cavafala.gd.muralha', 'Uma parede de terra que cresce do chão'),
    words: ['muralha', 'muro', 'parede', 'wall', 'barreira', 'barrier', 'paredao', 'muralla', 'fortaleza'],
    cost: { [M.Terra]: 36 },
    parts: () => [B(6, 3, 1, 0, 1.5, -2.5, 'main')],
  },
  {
    id: 'torre', kind: 'struct', beh: 'tower', main: '#8d8f99', acc: '#9a6a3f', terrain: true,
    name: () => t('cavafala.g.torre', 'Torre'), desc: () => t('cavafala.gd.torre', 'Um pilar de terra para ver tudo de cima'),
    words: ['torre', 'tower', 'pilar', 'coluna', 'pillar', 'torreao', 'mirante'],
    cost: { [M.Terra]: 26, [M.Pedra]: 10 },
    parts: () => [Cy(1.2, 1.4, 5, 0, 2.5, -2.5, 'main')],
  },
  {
    id: 'bloco', kind: 'struct', beh: 'block', main: '#9a6a3f', acc: '#ffffff', terrain: true,
    name: () => t('cavafala.g.bloco', 'Bloco'), desc: () => t('cavafala.gd.bloco', 'Um bloco de terra (devolve material ao mapa)'),
    words: ['bloco', 'cubo', 'block', 'cube', 'tijolo', 'brick', 'caixa', 'box', 'pedregulho'],
    cost: { [M.Terra]: 12 },
    parts: () => [B(2, 2, 2, 0, 1, -2.2, 'main')],
  },
  {
    id: 'plataforma', kind: 'struct', beh: 'platform', main: '#b07a40', acc: '#ffd34a',
    name: () => t('cavafala.g.plataforma', 'Plataforma'), desc: () => t('cavafala.gd.plataforma', 'Um chão flutuante'),
    words: ['plataforma', 'platform', 'tablado', 'palco', 'piso flutuante', 'deck'],
    cost: { [M.Terra]: 14, [M.Pedra]: 6 },
    parts: () => [B(3, 0.25, 3, 0, 2, -2.5, 'main'), B(3.1, 0.1, 0.2, 0, 2.15, -1.05, 'acc'), B(3.1, 0.1, 0.2, 0, 2.15, -3.95, 'acc'), S(0.3, 0, 1.75, -2.5, 'glow', [1.6, 0.4, 1.6], { glow: 0.6 })],
  },
  {
    id: 'catapulta', kind: 'struct', beh: 'catapult', main: '#b07a40', acc: '#ff4f6a',
    name: () => t('cavafala.g.catapulta', 'Catapulta'), desc: () => t('cavafala.gd.catapulta', 'Suba no copo e seja lançado longe'),
    words: ['catapulta', 'catapult', 'lancador', 'launcher', 'trebuchet', 'trabuco', 'estilingue gigante'],
    cost: { [M.Terra]: 18, [M.Argila]: 10, [M.Pedra]: 6 },
    parts: () => [B(1.8, 0.35, 2.6, 0, 0.45, -2, 'main'), ...wheel(-1, 0.32, -1.2), ...wheel(1, 0.32, -1.2), ...wheel(-1, 0.32, -2.8), ...wheel(1, 0.32, -2.8), B(0.3, 1.2, 0.3, 0, 1.1, -2.3, 'wood'), B(0.22, 0.22, 2.6, 0, 1.6, -1.8, 'acc', [-0.5, 0, 0]), S(0.55, 0, 2.15, -0.75, 'acc', [1, 0.5, 1])],
  },
  {
    id: 'ventilador', kind: 'struct', beh: 'fan', main: '#5ad6a0', acc: '#ffffff', arena: true,
    name: () => t('cavafala.g.ventilador', 'Ventilador'), desc: () => t('cavafala.gd.ventilador', 'Sopra tudo o que estiver na frente'),
    words: ['ventilador', 'fan', 'ventoinha', 'soprador', 'blower', 'abanador', 'ventilador gigante', 'vento'],
    cost: { [M.Argila]: 12, [M.Pedra]: 8 },
    parts: () => [Cy(0.5, 0.7, 0.25, 0, 0.12, -2, 'main'), Cy(0.1, 0.1, 1.1, 0, 0.75, -2, 'metal'), T(0.8, 0.07, 0, 1.6, -2, 'main'), S(0.2, 0, 1.6, -2, 'acc'), B(1.4, 0.32, 0.05, 0, 1.6, -2, 'acc', undefined, { spin: 'z' }), B(0.32, 1.4, 0.05, 0, 1.6, -2, 'acc', undefined, { spin: 'z' })],
  },
  {
    id: 'teleportador', kind: 'struct', beh: 'teleport', main: '#a05aff', acc: '#7ff0ff',
    name: () => t('cavafala.g.teleportador', 'Teleportador'), desc: () => t('cavafala.gd.teleportador', 'Dois portais: aqui e onde você mirar'),
    words: ['teleportador', 'teletransportador', 'teleporter', 'portal', 'teleporte', 'teletransporte', 'teleport'],
    cost: { [M.Cristal]: 8, [M.Pedra]: 10 },
    parts: () => [Cy(1, 1.1, 0.2, 0, 0.1, -2, 'main'), T(0.85, 0.08, 0, 0.25, -2, 'acc', [H, 0, 0], { glow: 1 }), Cy(0.8, 0.8, 1.6, 0, 1.0, -2, 'acc', undefined, { glass: true, glow: 0.6 })],
  },
  {
    id: 'bomba', kind: 'struct', beh: 'pump', main: '#3a7bd5', acc: '#ffd34a',
    name: () => t('cavafala.g.bomba', "Bomba d'Água"), desc: () => t('cavafala.gd.bomba', 'Esvazia lugares alagados'),
    words: ['bomba de agua', 'bomba dagua', 'bomba d agua', 'bomba', 'pump', 'water pump', 'drenador', 'sugador', 'esgotador', 'aspirador de agua'],
    cost: { [M.Pedra]: 10, [M.Argila]: 8 },
    parts: () => [B(1.2, 0.9, 1, 0, 0.45, -2, 'main'), Cy(0.25, 0.25, 1.2, 0.3, 1.4, -2, 'metal'), Cy(0.12, 0.12, 1.6, -0.9, 0.3, -2, 'acc', [0, 0, H]), S(0.25, 0.3, 2.05, -2, 'acc'), B(0.5, 0.15, 0.15, 0.3, 2.2, -2, 'dark')],
  },
  {
    id: 'escorregador', kind: 'struct', beh: 'slide', main: '#ff5a8a', acc: '#ffd34a',
    name: () => t('cavafala.g.escorregador', 'Escorregador'), desc: () => t('cavafala.gd.escorregador', 'Desce rapidinho, wheee!'),
    words: ['escorregador', 'escorrega', 'toboga', 'tobogan', 'slide', 'escorregadeira', 'tobogua'],
    cost: { [M.Argila]: 14, [M.Terra]: 10 },
    parts: () => [B(1.4, 0.15, 5, 0, 1.4, -2.5, 'main', [-0.5, 0, 0]), B(0.12, 0.35, 5, -0.7, 1.55, -2.5, 'acc', [-0.5, 0, 0]), B(0.12, 0.35, 5, 0.7, 1.55, -2.5, 'acc', [-0.5, 0, 0]), B(0.2, 2.6, 0.2, -0.6, 1.3, -0.5, 'metal'), B(0.2, 2.6, 0.2, 0.6, 1.3, -0.5, 'metal')],
  },
  {
    id: 'geleia', kind: 'struct', beh: 'jelly', main: '#ff5a8a', acc: '#ffffff', arena: true,
    name: () => t('cavafala.g.geleia', 'Bloco de Geleia'), desc: () => t('cavafala.gd.geleia', 'Gelatina que quica'),
    words: ['geleia', 'gelatina', 'jelly', 'bloco de geleia', 'pudim', 'jello', 'gelatina gigante'],
    cost: { [M.Argila]: 10, [M.Areia]: 8 },
    parts: () => [B(2, 1.2, 2, 0, 0.6, -2.2, 'main', undefined, { glass: true }), S(0.25, 0, 1.3, -2.2, 'acc', [2.4, 0.4, 2.4])],
  },
  {
    id: 'abrigo', kind: 'struct', beh: 'shelter', main: '#ffd7a8', acc: '#e8504a',
    name: () => t('cavafala.g.abrigo', 'Abrigo'), desc: () => t('cavafala.gd.abrigo', 'Uma casinha para se proteger'),
    words: ['abrigo', 'casinha', 'cabana', 'shelter', 'barraca', 'tenda', 'hut', 'iglu', 'igloo', 'cabaninha'],
    cost: { [M.Terra]: 24, [M.Argila]: 10, [M.Pedra]: 6 },
    parts: () => [B(0.25, 2, 3, -1.4, 1, -2.5, 'main'), B(0.25, 2, 3, 1.4, 1, -2.5, 'main'), B(3, 2, 0.25, 0, 1, -3.9, 'main'), B(3.4, 0.3, 3.6, 0, 2.15, -2.5, 'acc', [0, 0, 0]), K(2.2, 1.2, 0, 2.9, -2.5, 'acc', [0, PI / 4, 0])],
  },
  {
    id: 'poste', kind: 'struct', beh: 'lamp', main: '#3a2a5a', acc: '#fff3b0',
    name: () => t('cavafala.g.poste', 'Poste de Luz'), desc: () => t('cavafala.gd.poste', 'Ilumina cavernas e a noite'),
    words: ['poste', 'poste de luz', 'lamp post', 'lampiao', 'luminaria', 'street lamp', 'postinho'],
    cost: { [M.Pedra]: 8, [M.Cristal]: 2 },
    parts: () => [Cy(0.08, 0.12, 3, 0, 1.5, -2, 'main'), Cy(0.3, 0.4, 0.2, 0, 0.1, -2, 'main'), S(0.3, 0, 3.2, -2, 'acc', undefined, { glow: 1.2 }), K(0.4, 0.3, 0, 3.55, -2, 'main')],
  },
  {
    id: 'elevador', kind: 'struct', beh: 'elevator', main: '#ffd34a', acc: '#3a2a5a',
    name: () => t('cavafala.g.elevador', 'Elevador'), desc: () => t('cavafala.gd.elevador', 'Plataforma que sobe e desce'),
    words: ['elevador', 'elevator', 'lift', 'sobe desce', 'plataforma que sobe', 'ascensor'],
    cost: { [M.Pedra]: 12, [M.Argila]: 8 },
    parts: () => [B(2.2, 0.25, 2.2, 0, 0.15, -2.2, 'main'), B(0.2, 6, 0.2, -1.2, 3, -3.3, 'acc'), B(0.2, 6, 0.2, 1.2, 3, -3.3, 'acc'), B(2.6, 0.2, 0.2, 0, 6, -3.3, 'acc')],
  },
  {
    id: 'cerca', kind: 'struct', beh: 'fence', main: '#ffffff', acc: '#b07a40',
    name: () => t('cavafala.g.cerca', 'Cerca'), desc: () => t('cavafala.gd.cerca', 'Uma cerquinha de proteção'),
    words: ['cerca', 'fence', 'grade', 'cercadinho', 'cerquinha', 'alambrado'],
    cost: { [M.Terra]: 8, [M.Grama]: 4 },
    parts: () => {
      const p: Part[] = [];
      for (let i = 0; i < 6; i++) p.push(B(0.16, 1, 0.16, -2.5 + i, 0.5, -2, 'main'));
      p.push(B(5.4, 0.12, 0.08, 0, 0.75, -2, 'acc'), B(5.4, 0.12, 0.08, 0, 0.35, -2, 'acc'));
      return p;
    },
  },
  {
    id: 'boneco', kind: 'struct', beh: 'decoy', main: '#ffffff', acc: '#ff8a3a', arena: true,
    name: () => t('cavafala.g.boneco', 'Boneco Isca'), desc: () => t('cavafala.gd.boneco', 'Engana os rivais: eles atacam o boneco'),
    words: ['boneco', 'espantalho', 'decoy', 'isca', 'dummy', 'boneco de neve', 'snowman', 'sosia'],
    cost: { [M.Terra]: 8, [M.Grama]: 6 },
    parts: () => [S(0.55, 0, 0.55, -2, 'main'), S(0.4, 0, 1.35, -2, 'main'), S(0.08, -0.13, 1.45, -2.35, 'dark'), S(0.08, 0.13, 1.45, -2.35, 'dark'), K(0.07, 0.35, 0, 1.33, -2.5, 'acc', [-H, 0, 0])],
  },
  /* -------------------------------- ferramentas -------------------------------- */
  {
    id: 'balao', kind: 'tool', beh: 'balloon', main: '#ff4f6a', acc: '#ffffff',
    name: () => t('cavafala.g.balao', 'Balão'), desc: () => t('cavafala.gd.balao', 'Segure USAR para flutuar'),
    words: ['balao', 'balloon', 'bexiga', 'globo', 'balao de ar', 'baloes'],
    cost: { [M.Areia]: 8, [M.Argila]: 6 },
    parts: () => [Cy(0.008, 0.008, 0.8, 0, 0.4, 0, 'soft'), S(0.3, 0, 1.05, 0, 'main', [1, 1.15, 1]), K(0.06, 0.08, 0, 0.73, 0, 'main', [PI, 0, 0])],
  },
  {
    id: 'guardachuva', kind: 'tool', beh: 'umbrella', main: '#b05aff', acc: '#ffd34a',
    name: () => t('cavafala.g.guardachuva', 'Guarda-chuva'), desc: () => t('cavafala.gd.guardachuva', 'Cai devagarinho, planando'),
    words: ['guarda chuva', 'guardachuva', 'sombrinha', 'umbrella', 'paraguas', 'paraquedas', 'parachute'],
    cost: { [M.Argila]: 6, [M.Grama]: 6 },
    parts: () => [Cy(0.02, 0.02, 0.9, 0, 0.35, 0, 'dark'), K(0.55, 0.3, 0, 0.92, 0, 'main'), S(0.05, 0, 1.08, 0, 'acc'), T(0.06, 0.02, 0, -0.1, 0.06, 'dark', [0, H, 0])],
  },
  {
    id: 'jetpack', kind: 'tool', beh: 'jetpack', main: '#e8504a', acc: '#ffd34a',
    name: () => t('cavafala.g.jetpack', 'Jetpack'), desc: () => t('cavafala.gd.jetpack', 'Segure USAR para voar (recarrega no chão)'),
    words: ['jetpack', 'jet pack', 'mochila a jato', 'mochila jato', 'mochila voadora', 'jato'],
    cost: { [M.Pedra]: 10, [M.Ouro]: 3, [M.Argila]: 6 },
    parts: () => [Cy(0.11, 0.11, 0.42, -0.13, 0.2, 0, 'main'), Cy(0.11, 0.11, 0.42, 0.13, 0.2, 0, 'main'), S(0.11, -0.13, 0.41, 0, 'main'), S(0.11, 0.13, 0.41, 0, 'main'), K(0.08, 0.12, -0.13, -0.05, 0, 'metal', [PI, 0, 0]), K(0.08, 0.12, 0.13, -0.05, 0, 'metal', [PI, 0, 0]), B(0.3, 0.1, 0.06, 0, 0.25, 0.1, 'acc')],
  },
  {
    id: 'gancho', kind: 'tool', beh: 'hook', main: '#8d8f99', acc: '#ff8a3a',
    name: () => t('cavafala.g.gancho', 'Gancho'), desc: () => t('cavafala.gd.gancho', 'Mire e seja puxado até lá'),
    words: ['gancho', 'grappling hook', 'hook', 'gancho de escalada', 'arpao', 'garra', 'corda', 'cipo'],
    cost: { [M.Pedra]: 8, [M.Terra]: 6 },
    parts: () => [B(0.12, 0.2, 0.4, 0, 0, 0, 'acc'), Cy(0.05, 0.05, 0.4, 0, 0.05, -0.35, 'metal', [H, 0, 0]), K(0.07, 0.15, 0, 0.05, -0.62, 'main', [-H, 0, 0]), T(0.08, 0.02, 0.1, 0.05, -0.62, 'main', [0, 0, 0])],
  },
  {
    id: 'broca', kind: 'tool', beh: 'drill', main: '#ffcc33', acc: '#3a2a5a', starter: true,
    name: () => t('cavafala.g.broca', 'Broca Turbo'), desc: () => t('cavafala.gd.broca', 'Cava mais rápido e fura pedra'),
    words: ['broca turbo', 'broca', 'furadeira', 'perfuratriz', 'drill', 'turbo drill', 'super broca', 'britadeira', 'perfuradora'],
    cost: { [M.Pedra]: 14, [M.Ouro]: 3 },
    parts: () => [B(0.14, 0.24, 0.3, 0, -0.06, 0.05, 'acc'), Cy(0.1, 0.1, 0.25, 0, 0.06, -0.15, 'main', [H, 0, 0]), K(0.09, 0.32, 0, 0.06, -0.42, 'metal', [-H, 0, 0], { spin: 'z' }), T(0.08, 0.02, 0, 0.06, -0.33, 'acc')],
  },
  {
    id: 'pa', kind: 'tool', beh: 'shovel', main: '#8d8f99', acc: '#b07a40',
    name: () => t('cavafala.g.pa', 'Pá Gigante'), desc: () => t('cavafala.gd.pa', 'Cava buracos enormes (mais devagar)'),
    words: ['pa gigante', 'pa', 'pazona', 'shovel', 'giant shovel', 'pa grande', 'escavadora de mao'],
    cost: { [M.Terra]: 12, [M.Pedra]: 6 },
    parts: () => [Cy(0.03, 0.03, 0.7, 0, 0.1, -0.2, 'acc', [H * 0.8, 0, 0]), B(0.32, 0.04, 0.38, 0, 0.32, -0.6, 'main', [-0.3, 0, 0]), B(0.2, 0.05, 0.05, 0, -0.1, 0.12, 'acc')],
  },
  {
    id: 'escudo', kind: 'tool', beh: 'shield', main: '#7ff0ff', acc: '#ffffff', arena: true,
    name: () => t('cavafala.g.escudo', 'Escudo de Bolhas'), desc: () => t('cavafala.gd.escudo', 'Uma bolha que bloqueia empurrões'),
    words: ['escudo de bolhas', 'escudo', 'shield', 'bubble shield', 'protecao', 'escudo bolha', 'campo de forca'],
    cost: { [M.Areia]: 10, [M.Cristal]: 3 },
    parts: () => [Cy(0.3, 0.3, 0.05, 0, 0.1, -0.12, 'main', [H, 0, 0], { glass: true }), T(0.3, 0.03, 0, 0.1, -0.12, 'acc', [0, 0, 0]), S(0.07, 0, 0.1, -0.16, 'acc', undefined, { glow: 0.8 })],
  },
  {
    id: 'ima', kind: 'tool', beh: 'magnet', main: '#e8504a', acc: '#d8dce8',
    name: () => t('cavafala.g.ima', 'Ímã'), desc: () => t('cavafala.gd.ima', 'Puxa coisas e Bloops para perto'),
    words: ['ima', 'magnet', 'imantado', 'atrator', 'iman', 'imazao'],
    cost: { [M.Pedra]: 10, [M.Ouro]: 3 },
    parts: () => [T(0.18, 0.06, 0, 0.1, -0.3, 'main', [H, 0, 0], { d: [0.18, 0.06, PI] } as Partial<Part>), B(0.12, 0.12, 0.12, -0.18, 0.1, -0.3, 'acc'), B(0.12, 0.12, 0.12, 0.18, 0.1, -0.3, 'acc'), B(0.1, 0.24, 0.1, 0, -0.06, 0, 'dark')],
  },
  {
    id: 'mola', kind: 'tool', beh: 'spring', main: '#5ad6a0', acc: '#ffffff',
    name: () => t('cavafala.g.mola', 'Botas de Mola'), desc: () => t('cavafala.gd.mola', 'Pulos gigantes'),
    words: ['botas de mola', 'bota de mola', 'mola', 'spring', 'spring boots', 'sapato de mola', 'tenis de mola', 'molas', 'pula alto'],
    cost: { [M.Argila]: 8, [M.Pedra]: 4 },
    parts: () => [T(0.1, 0.025, 0, 0, 0, 'metal', [H, 0, 0]), T(0.1, 0.025, 0, 0.07, 0, 'metal', [H, 0, 0]), T(0.1, 0.025, 0, 0.14, 0, 'metal', [H, 0, 0]), S(0.14, 0, 0.26, -0.03, 'main', [1, 0.6, 1.4])],
  },
  {
    id: 'lanterna', kind: 'tool', beh: 'flashlight', main: '#3a7bd5', acc: '#fff3b0',
    name: () => t('cavafala.g.lanterna', 'Lanterna'), desc: () => t('cavafala.gd.lanterna', 'Ilumina o escuro'),
    words: ['lanterna', 'flashlight', 'lamparina', 'luz', 'lampada', 'farol de mao', 'torch', 'lanterninha'],
    cost: { [M.Cristal]: 3, [M.Pedra]: 4 },
    parts: () => [Cy(0.05, 0.05, 0.3, 0, 0.05, -0.1, 'main', [H, 0, 0]), Cy(0.09, 0.06, 0.12, 0, 0.05, -0.3, 'main', [H, 0, 0]), Cy(0.08, 0.08, 0.02, 0, 0.05, -0.37, 'acc', [H, 0, 0], { glow: 1.5 })],
  },
  {
    id: 'regador', kind: 'tool', beh: 'watering', main: '#5ab0ff', acc: '#ffd34a',
    name: () => t('cavafala.g.regador', 'Regador'), desc: () => t('cavafala.gd.regador', 'Rega plantas e jardins'),
    words: ['regador', 'watering can', 'mangueira', 'hose', 'regadeira', 'borrifador', 'aguador'],
    cost: { [M.Argila]: 8, [M.Areia]: 4 },
    parts: () => [Cy(0.15, 0.17, 0.28, 0, 0.05, -0.15, 'main'), Cy(0.025, 0.03, 0.35, 0, 0.12, -0.38, 'main', [-1, 0, 0]), Cy(0.06, 0.03, 0.05, 0, 0.26, -0.52, 'acc', [-1, 0, 0]), T(0.1, 0.02, 0, 0.22, -0.05, 'acc', [0, H, 0])],
  },
  {
    id: 'foguete', kind: 'tool', beh: 'rocket', main: '#ffffff', acc: '#e8504a', uses: 1,
    name: () => t('cavafala.g.foguete', 'Foguete'), desc: () => t('cavafala.gd.foguete', 'Um impulso enorme para cima (uso único)'),
    words: ['foguete', 'rocket', 'foguetinho', 'rojao', 'missil'],
    cost: { [M.Argila]: 6, [M.Ouro]: 2, [M.Areia]: 6 },
    parts: () => [Cy(0.09, 0.09, 0.5, 0, 0.25, 0, 'main'), K(0.09, 0.2, 0, 0.6, 0, 'acc'), B(0.03, 0.15, 0.15, 0.1, 0.05, 0, 'acc'), B(0.03, 0.15, 0.15, -0.1, 0.05, 0, 'acc'), S(0.04, 0, 0.35, -0.09, 'glass')],
  },
  {
    id: 'robo', kind: 'tool', beh: 'digbot', main: '#ffcf2e', acc: '#3a2a5a', uses: 2,
    name: () => t('cavafala.g.robo', 'Robô Cavador'), desc: () => t('cavafala.gd.robo', 'Um robozinho que cava sozinho onde você mirar'),
    words: ['robo cavador', 'robo', 'robot', 'robozinho', 'minerador', 'escavadeira', 'digger', 'toupeira', 'tatu', 'robo escavador'],
    cost: { [M.Pedra]: 10, [M.Ouro]: 2, [M.Cristal]: 2 },
    parts: () => [B(0.3, 0.22, 0.34, 0, 0.11, -0.2, 'main'), S(0.1, 0, 0.28, -0.25, 'acc'), S(0.035, -0.04, 0.3, -0.34, 'glass', undefined, { glow: 1 }), S(0.035, 0.04, 0.3, -0.34, 'glass', undefined, { glow: 1 }), K(0.06, 0.14, 0, 0.1, -0.44, 'metal', [-H, 0, 0], { spin: 'z' })],
  },
  {
    id: 'carrinho', kind: 'vehicle', beh: 'cart', main: '#ff4f6a', acc: '#ffd34a',
    name: () => t('cavafala.g.carrinho', 'Carrinho'), desc: () => t('cavafala.gd.carrinho', 'Anda rápido e dá trombadas (USAR monta/desce)'),
    words: ['carrinho', 'carro', 'cart', 'car', 'kart', 'go kart', 'carrinho de mina', 'vagonete', 'carrinho de mao', 'buggy'],
    cost: { [M.Pedra]: 10, [M.Terra]: 12, [M.Argila]: 6 },
    parts: () => [B(1.3, 0.4, 1.9, 0, 0.45, 0, 'main'), B(1.1, 0.4, 0.5, 0, 0.75, -0.6, 'acc'), ...wheel(-0.72, 0.28, -0.65), ...wheel(0.72, 0.28, -0.65), ...wheel(-0.72, 0.28, 0.65), ...wheel(0.72, 0.28, 0.65), S(0.1, -0.4, 0.6, -0.97, 'glass', undefined, { glow: 1 }), S(0.1, 0.4, 0.6, -0.97, 'glass', undefined, { glow: 1 })],
  },
  /* -------------------------------- "armas" de brinquedo -------------------------------- */
  {
    id: 'canhao', kind: 'weapon', beh: 'foam', main: '#ff8a3a', acc: '#ffffff', starter: true, arena: true,
    name: () => t('cavafala.g.canhao', 'Canhão de Espuma'), desc: () => t('cavafala.gd.canhao', 'Bolas de espuma que empurram'),
    words: ['canhao de espuma', 'canhao', 'foam cannon', 'cannon', 'lanca espuma', 'espumador', 'canhao espuma', 'arma de espuma'],
    cost: { [M.Argila]: 10, [M.Areia]: 8 },
    parts: () => [B(0.18, 0.2, 0.36, 0, 0, 0, 'main'), Cy(0.08, 0.1, 0.42, 0, 0.06, -0.36, 'main', [H, 0, 0]), T(0.1, 0.025, 0, 0.06, -0.57, 'acc'), S(0.12, 0, 0.2, 0.05, 'acc', undefined, { glass: true }), B(0.08, 0.16, 0.08, 0, -0.14, 0.08, 'dark')],
  },
  {
    id: 'bolhas', kind: 'weapon', beh: 'bubble', main: '#7ff0ff', acc: '#ff8fd8', arena: true,
    name: () => t('cavafala.g.bolhas', 'Lançador de Bolhas'), desc: () => t('cavafala.gd.bolhas', 'Prende o alvo numa bolha flutuante'),
    words: ['lancador de bolhas', 'bubble launcher', 'bubble gun', 'arma de bolhas', 'soprador de bolhas', 'bolhas', 'bolha', 'bolheiro'],
    cost: { [M.Areia]: 12, [M.Cristal]: 2 },
    parts: () => [B(0.16, 0.18, 0.3, 0, 0, 0, 'acc'), Cy(0.06, 0.06, 0.25, 0, 0.05, -0.27, 'acc', [H, 0, 0]), T(0.13, 0.025, 0, 0.05, -0.43, 'main', [0, 0, 0]), S(0.09, 0.12, 0.2, -0.1, 'main', undefined, { glass: true }), S(0.06, -0.1, 0.24, -0.02, 'main', undefined, { glass: true })],
  },
  {
    id: 'neve', kind: 'weapon', beh: 'snow', main: '#ffffff', acc: '#5ab0ff', arena: true,
    name: () => t('cavafala.g.neve', 'Lança-Neve'), desc: () => t('cavafala.gd.neve', 'Bolas de neve que deixam o alvo lento'),
    words: ['bola de neve', 'snowball', 'lanca neve', 'canhao de neve', 'bolas de neve', 'neve', 'snow'],
    cost: { [M.Grama]: 10, [M.Cristal]: 2 },
    parts: () => [B(0.16, 0.18, 0.32, 0, 0, 0, 'acc'), Cy(0.09, 0.09, 0.3, 0, 0.06, -0.3, 'acc', [H, 0, 0]), S(0.11, 0, 0.06, -0.5, 'main')],
  },
  {
    id: 'confete', kind: 'weapon', beh: 'confetti', main: '#ffd34a', acc: '#ff4f6a',
    name: () => t('cavafala.g.confete', 'Canhão de Confete'), desc: () => t('cavafala.gd.confete', 'Leque de confete que empurra de leve'),
    words: ['canhao de confete', 'confete', 'confetti', 'confetti cannon', 'lanca confete', 'serpentina', 'festa'],
    cost: { [M.Grama]: 8, [M.Areia]: 6 },
    parts: () => [B(0.16, 0.18, 0.3, 0, 0, 0, 'acc'), K(0.16, 0.36, 0, 0.06, -0.34, 'main', [H, 0, 0]), S(0.03, 0.05, 0.09, -0.5, '#5ab0ff'), S(0.03, -0.05, 0.03, -0.5, '#5ad6a0')],
  },
  {
    id: 'tornado', kind: 'weapon', beh: 'tornado', main: '#d8e8ff', acc: '#7a5aff', arena: true,
    name: () => t('cavafala.g.tornado', 'Tornado de Bolso'), desc: () => t('cavafala.gd.tornado', 'Solta um redemoinho que empurra tudo'),
    words: ['tornado de bolso', 'tornado', 'redemoinho', 'furacao', 'ciclone', 'whirlwind', 'tornadinho'],
    cost: { [M.Areia]: 10, [M.Grama]: 6 },
    parts: () => [Cy(0.12, 0.05, 0.3, 0, 0.1, -0.1, 'acc'), K(0.18, 0.4, 0, 0.45, -0.1, 'main', [PI, 0, 0], { glass: true, spin: 'y' })],
  },
  {
    id: 'luva', kind: 'weapon', beh: 'glove', main: '#e8504a', acc: '#ffffff', arena: true,
    name: () => t('cavafala.g.luva', 'Luva de Mola'), desc: () => t('cavafala.gd.luva', 'Um soquinho de mola que empurra longe'),
    words: ['luva de mola', 'luva', 'luva de boxe', 'boxing glove', 'punho', 'soco', 'glove', 'luvona'],
    cost: { [M.Argila]: 8, [M.Terra]: 8 },
    parts: () => [S(0.17, 0, 0.05, -0.3, 'main', [1, 0.9, 1.1]), S(0.07, 0.15, 0.08, -0.25, 'main'), Cy(0.1, 0.1, 0.12, 0, 0.05, -0.1, 'acc', [H, 0, 0]), T(0.06, 0.02, 0, 0.05, 0.05, 'metal')],
  },
  {
    id: 'martelo', kind: 'weapon', beh: 'hammer', main: '#ffd34a', acc: '#5ab0ff', arena: true,
    name: () => t('cavafala.g.martelo', 'Martelo de Espuma'), desc: () => t('cavafala.gd.martelo', 'Pancada fofa que joga para cima'),
    words: ['martelo de espuma', 'martelo', 'hammer', 'marreta', 'foam hammer', 'martelao'],
    cost: { [M.Areia]: 8, [M.Terra]: 8 },
    parts: () => [Cy(0.035, 0.035, 0.7, 0, 0.25, 0, 'acc'), Cy(0.16, 0.16, 0.45, 0, 0.62, 0, 'main', [0, 0, H])],
  },
  {
    id: 'cavabomba', kind: 'weapon', beh: 'digbomb', main: '#5a5f78', acc: '#ff4f6a', uses: 3, arena: true,
    name: () => t('cavafala.g.cavabomba', 'Bomba de Cavar'), desc: () => t('cavafala.gd.cavabomba', 'Jogue e ela abre uma cratera (e guarda a terra)'),
    words: ['bomba de cavar', 'bomba de terra', 'dig bomb', 'cava bomba', 'dinamite de confete', 'explosivo', 'granada de confete', 'bomba de buraco'],
    cost: { [M.Argila]: 5, [M.Areia]: 5 },
    parts: () => [S(0.15, 0, 0.15, -0.1, 'main'), Cy(0.02, 0.02, 0.12, 0, 0.32, -0.1, 'acc'), S(0.03, 0, 0.4, -0.1, '#ffd34a', undefined, { glow: 1.5 })],
  },
];

export const gadgetById = (id: string): GDef | undefined => GADGETS.find((g) => g.id === id);

/* ------------------------------ módulos e modificadores ------------------------------ */
export interface ModDef {
  id: ModuleId;
  name: () => string;
  words: string[];
  cost: Partial<Record<number, number>>;
}
export const MODULES: ModDef[] = [
  { id: 'rodas', name: () => t('cavafala.mod.rodas', 'com rodas'), words: ['rodas', 'roda', 'wheels', 'wheel', 'rodinhas', 'rodinha'], cost: { [M.Pedra]: 5 } },
  { id: 'mola', name: () => t('cavafala.mod.mola', 'com mola'), words: ['mola', 'molas', 'spring', 'springs', 'saltitante', 'bouncy', 'pulante'], cost: { [M.Argila]: 5 } },
  { id: 'helice', name: () => t('cavafala.mod.helice', 'com hélice'), words: ['helice', 'helices', 'propeller', 'voador', 'voadora', 'flying', 'helicoptero', 'que voa'], cost: { [M.Terra]: 4, [M.Cristal]: 2 } },
  { id: 'foguete', name: () => t('cavafala.mod.foguete', 'com foguete'), words: ['foguete', 'foguetes', 'rocket', 'jato', 'turbinado', 'propulsor'], cost: { [M.Argila]: 4, [M.Ouro]: 1 } },
  { id: 'luz', name: () => t('cavafala.mod.luz', 'com luz'), words: ['luz', 'luzes', 'light', 'brilhante', 'iluminado', 'que brilha', 'neon'], cost: { [M.Cristal]: 2 } },
  { id: 'bolhas', name: () => t('cavafala.mod.bolhas', 'de bolhas'), words: ['bolhas', 'bolha', 'bubbles', 'bubble', 'borbulhante'], cost: { [M.Areia]: 5 } },
  { id: 'ima', name: () => t('cavafala.mod.ima', 'com ímã'), words: ['ima', 'magnet', 'magnetico', 'imantado', 'teleguiado', 'homing'], cost: { [M.Pedra]: 3, [M.Ouro]: 1 } },
  { id: 'espuma', name: () => t('cavafala.mod.espuma', 'de espuma'), words: ['espuma', 'foam', 'fofo', 'fofinho', 'macio'], cost: { [M.Areia]: 3 } },
  { id: 'gelo', name: () => t('cavafala.mod.gelo', 'de gelo'), words: ['gelo', 'ice', 'congelante', 'gelado', 'frozen', 'neve'], cost: { [M.Cristal]: 1, [M.Grama]: 3 } },
  { id: 'confete', name: () => t('cavafala.mod.confete', 'de confete'), words: ['confete', 'confetti', 'festa', 'colorido', 'arco iris', 'rainbow'], cost: { [M.Grama]: 3 } },
];

export type SizeMod = 'normal' | 'grande' | 'pequeno' | 'gigante';
export interface Mods {
  size: SizeMod;
  /** material que substitui a cor/custo principal (0 = padrão) */
  mat: number;
  double: boolean;
  fast: boolean;
  modules: ModuleId[];
}
export const noMods = (): Mods => ({ size: 'normal', mat: 0, double: false, fast: false, modules: [] });

export const SIZE_WORDS: Record<Exclude<SizeMod, 'normal'>, string[]> = {
  grande: ['grande', 'grandao', 'grandona', 'enorme', 'big', 'large', 'huge', 'maior', 'grandes'],
  pequeno: ['pequeno', 'pequena', 'pequenino', 'pequenininho', 'mini', 'small', 'tiny', 'little', 'minusculo', 'pequenos', 'baixinho'],
  gigante: ['gigante', 'gigantesco', 'giant', 'mega', 'colossal', 'gigantesca', 'imenso', 'titanico'],
};
export const DOUBLE_WORDS = ['duplo', 'dupla', 'dois', 'duas', 'double', 'two', 'dobro', 'gemeos', 'par', 'dobrado', 'twin'];
export const FAST_WORDS = ['rapido', 'rapida', 'turbo', 'veloz', 'fast', 'quick', 'speedy', 'super', 'ligeiro', 'acelerado'];
export const MAT_WORDS: [number, string[]][] = [
  [M.Ouro, ['ouro', 'dourado', 'dourada', 'gold', 'golden', 'oro']],
  [M.Cristal, ['cristal', 'cristais', 'crystal', 'diamante', 'diamond', 'vidro', 'glass']],
  [M.Pedra, ['pedra', 'stone', 'rock', 'rocha', 'granito', 'piedra']],
  [M.Argila, ['argila', 'barro', 'clay', 'ceramica', 'tijolo']],
  [M.Areia, ['areia', 'sand', 'arena']],
  [M.Terra, ['terra', 'dirt', 'earth', 'lama', 'mud', 'tierra']],
  [M.Grama, ['grama', 'grass', 'capim', 'folhas', 'mato']],
];

const MAT_HEX: Record<number, string> = { [M.Ouro]: '#ffcc33', [M.Cristal]: '#8ff0ff', [M.Pedra]: '#9a9cab', [M.Argila]: '#c8714a', [M.Areia]: '#f0d48a', [M.Terra]: '#9a6a3f', [M.Grama]: '#6cc24a' };

/** potência/tamanho resultantes dos modificadores */
export function modStats(m: Mods): { scale: number; power: number; speed: number; count: number } {
  const scale = m.size === 'grande' ? 1.5 : m.size === 'pequeno' ? 0.6 : m.size === 'gigante' ? 2.2 : 1;
  let power = m.size === 'grande' ? 1.3 : m.size === 'pequeno' ? 0.75 : m.size === 'gigante' ? 1.7 : 1;
  if (m.mat === M.Ouro) power *= 1.5;
  if (m.mat === M.Pedra) power *= 1.15;
  const speed = (m.fast ? 1.6 : 1) * (m.mat === M.Cristal ? 1.3 : 1);
  return { scale, power, speed, count: m.double ? 2 : 1 };
}

/** custo final (materiais) */
export function costOf(g: GDef, m: Mods): Inv {
  const c: Inv = {};
  const mul = (m.size === 'grande' ? 2.2 : m.size === 'pequeno' ? 0.45 : m.size === 'gigante' ? 4 : 1) * (m.double ? 2 : 1) * (m.fast ? 1.25 : 1);
  for (const [k, v] of Object.entries(g.cost)) {
    let mat = +k;
    let amt = v! * mul;
    // material trocado: os materiais "moles" viram o material pedido
    if (m.mat && (mat === M.Terra || mat === M.Argila || mat === M.Areia || mat === M.Grama)) {
      const rate = m.mat === M.Ouro || m.mat === M.Cristal ? 0.3 : m.mat === M.Pedra ? 0.7 : 1;
      mat = m.mat;
      amt *= rate;
    }
    c[mat] = (c[mat] ?? 0) + amt;
  }
  for (const id of m.modules) {
    const md = MODULES.find((x) => x.id === id)!;
    for (const [k, v] of Object.entries(md.cost)) c[+k] = (c[+k] ?? 0) + v! * (m.double ? 2 : 1);
  }
  for (const k of Object.keys(c)) c[+k] = Math.max(1, Math.ceil(c[+k]));
  return c;
}

export function canPay(inv: Inv, c: Inv): boolean {
  return Object.entries(c).every(([k, v]) => (inv[+k] ?? 0) >= v);
}
export function missing(inv: Inv, c: Inv): Inv {
  const out: Inv = {};
  for (const [k, v] of Object.entries(c)) {
    const h = inv[+k] ?? 0;
    if (h < v) out[+k] = Math.ceil(v - h);
  }
  return out;
}
export function pay(inv: Inv, c: Inv): void {
  for (const [k, v] of Object.entries(c)) inv[+k] = Math.max(0, (inv[+k] ?? 0) - v);
}

/** nome completo com modificadores (para avisos) */
export function fullName(g: GDef, m: Mods): string {
  const bits: string[] = [g.name()];
  if (m.size === 'grande') bits.push(t('cavafala.mod.grande', 'grande'));
  if (m.size === 'pequeno') bits.push(t('cavafala.mod.mini', 'mini'));
  if (m.size === 'gigante') bits.push(t('cavafala.mod.gigante', 'gigante'));
  if (m.mat) bits.push(t('cavafala.mod.de', 'de {m}', { m: matWord(m.mat) }));
  if (m.fast) bits.push(t('cavafala.mod.turbo', 'turbo'));
  if (m.double) bits.push('×2');
  for (const id of m.modules) bits.push(MODULES.find((x) => x.id === id)!.name());
  return bits.join(' ');
}
function matWord(m: number): string {
  switch (m) {
    case M.Ouro:
      return t('cavafala.mat.ouro', 'ouro');
    case M.Cristal:
      return t('cavafala.mat.cristal', 'cristal');
    case M.Pedra:
      return t('cavafala.mat.pedra', 'pedra');
    case M.Argila:
      return t('cavafala.mat.argila', 'argila');
    case M.Areia:
      return t('cavafala.mat.areia', 'areia');
    case M.Terra:
      return t('cavafala.mat.terra', 'terra');
    default:
      return t('cavafala.mat.grama', 'grama');
  }
}

/* ------------------------------ peças dos módulos ------------------------------ */
function bbox(parts: Part[]): THREE.Box3 {
  const b = new THREE.Box3();
  for (const p of parts) {
    const e = p.s === 'box' ? Math.max(p.d[0], p.d[1], p.d[2]) / 2 : p.s === 'cyl' ? Math.max(p.d[0], p.d[1], p.d[2] / 2) : p.d[0];
    b.expandByPoint(new THREE.Vector3(p.p[0] - e, p.p[1] - e, p.p[2] - e));
    b.expandByPoint(new THREE.Vector3(p.p[0] + e, p.p[1] + e, p.p[2] + e));
  }
  return b;
}

function moduleParts(id: ModuleId, bb: THREE.Box3, held: boolean): Part[] {
  const c = bb.getCenter(new THREE.Vector3());
  const s = bb.getSize(new THREE.Vector3());
  const k = held ? 0.35 : 1;
  switch (id) {
    case 'rodas': {
      const r = 0.3 * k;
      const y = bb.min.y + r * 0.6;
      return [...wheel(bb.min.x - 0.05 * k, y, bb.min.z + s.z * 0.2, r), ...wheel(bb.max.x + 0.05 * k, y, bb.min.z + s.z * 0.2, r), ...wheel(bb.min.x - 0.05 * k, y, bb.max.z - s.z * 0.2, r), ...wheel(bb.max.x + 0.05 * k, y, bb.max.z - s.z * 0.2, r)];
    }
    case 'mola':
      return [0, 1, 2, 3].map((i) => T(0.25 * k, 0.05 * k, c.x, bb.min.y - 0.1 * k - i * 0.12 * k, c.z, 'metal', [H, 0, 0]));
    case 'helice':
      return [Cy(0.04 * k, 0.04 * k, 0.5 * k, c.x, bb.max.y + 0.25 * k, c.z, 'metal'), B(1.6 * k, 0.04 * k, 0.2 * k, c.x, bb.max.y + 0.5 * k, c.z, 'acc', undefined, { spin: 'y' }), B(0.2 * k, 0.04 * k, 1.6 * k, c.x, bb.max.y + 0.5 * k, c.z, 'acc', undefined, { spin: 'y' })];
    case 'foguete':
      return [Cy(0.2 * k, 0.2 * k, 0.6 * k, c.x, c.y, bb.max.z + 0.3 * k, '#ffffff', [H, 0, 0]), K(0.2 * k, 0.3 * k, c.x, c.y, bb.max.z + 0.75 * k, '#ff8a3a', [H, 0, 0], { glow: 1.2 })];
    case 'luz':
      return [S(0.18 * k, c.x, bb.max.y + 0.15 * k, c.z, '#fff3b0', undefined, { glow: 1.6 })];
    case 'bolhas':
      return [S(0.2 * k, c.x - s.x * 0.3, bb.max.y + 0.2 * k, c.z, '#bff4ff', undefined, { glass: true }), S(0.14 * k, c.x + s.x * 0.25, bb.max.y + 0.35 * k, c.z + 0.1, '#ffd8f4', undefined, { glass: true }), S(0.1 * k, c.x, bb.max.y + 0.5 * k, c.z - 0.1, '#bff4ff', undefined, { glass: true })];
    case 'ima':
      return [T(0.22 * k, 0.07 * k, c.x, c.y, bb.min.z - 0.15 * k, '#e8504a', [H, 0, 0], { d: [0.22 * k, 0.07 * k, PI] } as Partial<Part>)];
    case 'espuma':
      return [S(0.18 * k, bb.min.x, bb.max.y, c.z, '#ffffff'), S(0.14 * k, bb.max.x, bb.max.y, c.z + 0.1, '#ffffff'), S(0.12 * k, c.x, bb.max.y + 0.08, bb.min.z, '#ffffff')];
    case 'gelo':
      return [K(0.08 * k, 0.4 * k, bb.min.x + 0.1, bb.min.y - 0.1 * k, c.z, '#bff4ff', [PI, 0, 0], { glow: 0.4 }), K(0.08 * k, 0.3 * k, bb.max.x - 0.1, bb.min.y - 0.08 * k, c.z, '#bff4ff', [PI, 0, 0], { glow: 0.4 }), K(0.08 * k, 0.35 * k, c.x, bb.min.y - 0.09 * k, bb.min.z + 0.1, '#bff4ff', [PI, 0, 0], { glow: 0.4 })];
    case 'confete':
      return ['#ff4f6a', '#ffd34a', '#5ab0ff', '#5ad6a0', '#b05aff'].map((col, i) => S(0.07 * k, c.x + Math.cos(i * 1.3) * s.x * 0.4, bb.max.y + 0.05 + (i % 2) * 0.1 * k, c.z + Math.sin(i * 1.3) * s.z * 0.4, col));
  }
}

/* ------------------------------ montagem do modelo ------------------------------ */
const ROLE: Record<string, string> = { metal: '#c0c6d8', dark: '#3a2a5a', wood: '#a0703a', soft: '#ffffff', glass: '#bff4ff', glow: '#fff3b0' };
const geoCache = new Map<string, THREE.BufferGeometry>();
function partGeo(p: Part): THREE.BufferGeometry {
  const key = p.s + p.d.map((v) => v.toFixed(3)).join(',');
  let g = geoCache.get(key);
  if (g) return g;
  switch (p.s) {
    case 'box':
      g = new THREE.BoxGeometry(p.d[0], p.d[1], p.d[2]);
      break;
    case 'cyl':
      g = new THREE.CylinderGeometry(p.d[0], p.d[1], p.d[2], 14);
      break;
    case 'sph':
      g = new THREE.SphereGeometry(p.d[0], 14, 10);
      if (p.d.length >= 4) g.scale(p.d[1], p.d[2], p.d[3]);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(p.d[0], p.d[1], 14);
      break;
    case 'torus':
      g = new THREE.TorusGeometry(p.d[0], p.d[1], 8, 20, p.d[2] ?? PI * 2);
      break;
    default:
      g = new THREE.CapsuleGeometry(p.d[0], p.d[1], 4, 8);
  }
  geoCache.set(key, g);
  return g;
}
const glassMats = new Map<string, THREE.MeshLambertMaterial>();
function partMat(col: string, glow: number, glass: boolean): THREE.Material {
  if (glass) {
    let m = glassMats.get(col + glow);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false });
      if (glow) m.emissive.set(col).multiplyScalar(glow * 0.5);
      glassMats.set(col + glow, m);
    }
    return m;
  }
  return lam(col, glow ? Math.min(1, glow * 0.6) : 0);
}
export function disposeGadgetCache(): void {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
  glassMats.forEach((m) => m.dispose());
  glassMats.clear();
}

export interface Built {
  group: THREE.Group;
  parts: THREE.Mesh[];
  spinners: { o: THREE.Object3D; ax: 'x' | 'y' | 'z' }[];
  box: THREE.Box3;
}

/** monta o modelo (peças separadas para animar a construção) */
export function buildModel(g: GDef, m: Mods, held = false): Built {
  const { scale } = modStats(m);
  let list = g.parts();
  const bb = bbox(list);
  for (const id of m.modules) list = list.concat(moduleParts(id, bb, held || g.kind !== 'struct'));
  const main = m.mat ? MAT_HEX[m.mat] : g.main;
  const glass = m.mat === M.Cristal;
  const group = new THREE.Group();
  const parts: THREE.Mesh[] = [];
  const spinners: Built['spinners'] = [];
  for (const p of list) {
    let col = p.c === 'main' ? main : p.c === 'acc' ? g.acc : p.c === 'acc2' ? new THREE.Color(main).multiplyScalar(0.82).getStyle() : (ROLE[p.c] ?? p.c);
    if (m.mat === M.Ouro && (p.c === 'metal' || p.c === 'acc')) col = p.c === 'metal' ? '#ffe680' : col;
    const isGlass = !!p.glass || (glass && p.c === 'main');
    const mesh = new THREE.Mesh(partGeo(p), partMat(col, p.glow ?? (m.mat === M.Cristal && p.c === 'main' ? 0.5 : m.mat === M.Ouro && p.c === 'main' ? 0.25 : 0), isGlass));
    mesh.position.set(p.p[0] * scale, p.p[1] * scale, p.p[2] * scale);
    if (p.r) mesh.rotation.set(p.r[0], p.r[1], p.r[2]);
    mesh.scale.setScalar(scale);
    mesh.castShadow = !held;
    group.add(mesh);
    parts.push(mesh);
    if (p.spin) spinners.push({ o: mesh, ax: p.spin });
  }
  const box = new THREE.Box3().setFromObject(group);
  return { group, parts, spinners, box };
}
