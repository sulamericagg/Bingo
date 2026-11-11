/* ============================================================
 *  MIRA (kit de interação 3D) — "o que a mão vai pegar/apertar agora".
 *  Raio do centro da tela contra caixas (AABB) registradas. Sem alocação
 *  por quadro. Ajudas para dedo no celular:
 *   - margem de assistência: errar por pouco ainda acerta (caixas "infladas");
 *   - histerese: o alvo atual só troca se o novo estiver claramente melhor
 *     (o rótulo/botão não pisca quando a mira passa entre dois objetos);
 *   - viés: controles pequenos (botões, maçanetas) ganham dos móveis atrás.
 * ============================================================ */
import * as THREE from 'three';

export interface AimTarget<T = unknown> {
  /** caixa no MUNDO (atualize quando o objeto se mover) */
  readonly box: THREE.Box3;
  data: T;
  /** somado à distância (negativo = preferido). Controles pequenos: -0.25 */
  bias: number;
  /** desligado = ignorado pela mira */
  enabled: boolean;
}

const HIT = new THREE.Vector3();
const BIG = new THREE.Box3();

export class AimPicker<T = unknown> {
  readonly list: AimTarget<T>[] = [];
  /** alcance da mão (m) */
  reach = 2.5;
  /** inflar as caixas em (m por metro de distância) na 2ª chance */
  assist = 0.06;
  /** vantagem do alvo atual (m) */
  sticky = 0.12;
  current: AimTarget<T> | null = null;
  /** distância ao alvo atual (m) */
  dist = 0;

  add(data: T, box?: THREE.Box3, bias = 0): AimTarget<T> {
    const t: AimTarget<T> = { box: box ?? new THREE.Box3(), data, bias, enabled: true };
    this.list.push(t);
    return t;
  }
  remove(t: AimTarget<T>): void {
    const i = this.list.indexOf(t);
    if (i >= 0) this.list.splice(i, 1);
    if (this.current === t) this.current = null;
  }
  clear(): void {
    this.list.length = 0;
    this.current = null;
  }
  /** caixa de uma esfera (itens soltos) */
  static sphere(t: AimTarget<unknown>, x: number, y: number, z: number, r: number): void {
    t.box.min.set(x - r, y - r, z - r);
    t.box.max.set(x + r, y + r, z + r);
  }

  /** escolhe o melhor alvo para o raio (câmera → frente). Retorna e guarda em `current`. */
  pick(ray: THREE.Ray): AimTarget<T> | null {
    let best: AimTarget<T> | null = null;
    let bs = Infinity;
    let bd = 0;
    for (const t of this.list) {
      if (!t.enabled) continue;
      let d = -1;
      let pen = 0;
      if (ray.intersectBox(t.box, HIT)) d = HIT.distanceTo(ray.origin);
      else {
        // 2ª chance: caixa inflada proporcional à distância (mira assistida)
        const c = t.box;
        const cx = (c.min.x + c.max.x) / 2 - ray.origin.x;
        const cy = (c.min.y + c.max.y) / 2 - ray.origin.y;
        const cz = (c.min.z + c.max.z) / 2 - ray.origin.z;
        const far = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (far > this.reach + 0.6) continue;
        const m = 0.03 + this.assist * far;
        BIG.min.set(c.min.x - m, c.min.y - m, c.min.z - m);
        BIG.max.set(c.max.x + m, c.max.y + m, c.max.z + m);
        if (ray.intersectBox(BIG, HIT)) {
          d = HIT.distanceTo(ray.origin);
          pen = 0.35;
        }
      }
      if (d < 0 || d > this.reach) continue;
      const s = d + pen + t.bias - (t === this.current ? this.sticky : 0);
      if (s < bs) {
        bs = s;
        best = t;
        bd = d;
      }
    }
    this.current = best;
    this.dist = bd;
    return best;
  }
}
