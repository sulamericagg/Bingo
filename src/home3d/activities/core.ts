/* ============================================================
 *  CASA 3D · ATIVIDADES — contrato entre o controlador (index.ts) e
 *  as estações (cozinha, tarefas, festa, extras).
 *  Uma "Spot" é qualquer coisa que dá para mirar: um móvel do catálogo
 *  (fogão, pia, cama...) ou um utensílio deste módulo (frigideira, tábua...).
 * ============================================================ */
import * as THREE from 'three';
import type { Engine, ItemRec } from '../engine';
import type { Fps, Target } from '../fps';
import type { ActDef } from '../ui';
import type { Kind } from '../adapter';
import type { Prop, Props } from './props';
import type { ActUI } from './ui';

export interface Spot {
  id: string;
  /** distância do raio até a mira (null = não está mirando) */
  hit(ray: THREE.Ray, tg: Target): number | null;
  label(): string;
  /** botões (h = o que está na mão deste módulo) */
  acts(h: Prop | null): ActDef[];
  tap?(id: string, h: Prop | null): boolean;
  /** botão de segurar (hold) apertado neste quadro */
  hold?(id: string, dt: number, h: Prop | null): void;
  /** onde soltar o que está na mão ao COLOCAR (null = não aceita) */
  place?(p: Prop): THREE.Vector3 | null;
  placeLabel?(p: Prop): string;
}

export interface Ctx {
  eng: Engine;
  fps: Fps;
  props: Props;
  ui: ActUI;
  /** prop na mão (deste módulo) */
  held(): Prop | null;
  /** põe um prop na mão (soltando o anterior) */
  hand(p: Prop): void;
  /** solta da mão sem velocidade (para quem vai reposicionar) */
  unhand(): Prop | null;
  /** posição à frente do jogador (para nascer coisas) */
  front(dist?: number, up?: number): THREE.Vector3;
  coin(n: number): number;
  /** som/música de festa ligada em algum lugar */
  music: { on: boolean; start(): void };
  /** pose da mão controlada pelo módulo neste quadro */
  pose(p: 'knife' | 'spoon' | 'sponge' | 'vacuum' | 'grab' | 'open'): void;
  items(kind: Kind | Kind[]): ItemRec[];
  startParty(): void;
  partyActive(): boolean;
}

const M = new THREE.Matrix4();
const R = new THREE.Ray();
const B = new THREE.Box3();
const P = new THREE.Vector3();
/** raio × caixa local de um objeto (devolve distância no mundo ou null) */
export function hitBox(ray: THREE.Ray, obj: THREE.Object3D, min: THREE.Vector3, max: THREE.Vector3, far = 2.8): number | null {
  M.copy(obj.matrixWorld).invert();
  R.copy(ray).applyMatrix4(M);
  B.min.copy(min);
  B.max.copy(max);
  if (!R.intersectBox(B, P)) return null;
  P.applyMatrix4(obj.matrixWorld);
  const d = P.distanceTo(ray.origin);
  return d <= far ? d : null;
}
/** spot de um móvel do catálogo: mira = alvo do FPS */
export function itemHit(it: ItemRec, tg: Target): number | null {
  return tg.type === 'item' && tg.item === it && tg.dist < 2.8 ? tg.dist : null;
}
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** ponto local de um móvel (base no chão) → mundo */
export function itemLocal(it: ItemRec, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x, y, z).applyQuaternion(it.obj.quaternion).add(it.obj.position);
}
