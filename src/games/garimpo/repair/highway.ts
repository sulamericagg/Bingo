/* ============================================================
 *  CONSERTOS — ESTRADA (haul/*): rampas de escape nos pontos Road.ramps e o freio da
 *  carreta que falha antes de uma delas.
 *  - chunk(): placa azul 260 m antes, balizas zebradas nas bordas da faixa de cascalho,
 *    pneus empilhados e areia no fim (o chão da faixa sobe: Road.rampAt/ground);
 *  - input(): sem freio enquanto a emergência dura (e o motor não anda com o freio quebrado);
 *  - post(): freio-motor/escape/cascalho segurando a carreta; sorteio da falha (uma chance
 *    por rampa, ~300 m antes, carregado e rápido).
 *  Ganchos em haul/level.ts (marcados "CONSERTOS").
 * ============================================================ */
import * as THREE from 'three';
import type { Highway } from '../haul/level';
import { HALF, RAMP_LEN, RAMP_RISE, RAMP_W, type Road } from '../haul/road';
import type { Rig } from '../haul/rig';
import { gravel, rampSign } from './brake';

interface RepLike {
  readonly emg: { active: boolean; decel: number };
  hwNoBrake: boolean;
  hwBroken: boolean;
  hwDecel: number;
  brakeFailure(t: Rig): boolean;
  hwChance(): number;
  hwFrame(dt: number, camYaw: number): void;
}
const P = [0, 0, 0, 0, 0];
const rolled = new WeakMap<Road, Set<number>>();
let road: Road | null = null;

function rampAhead(rd: Road, s: number): { s: number; side: 1 | -1 } | null {
  for (const r of rd.ramps) if (r.s + RAMP_LEN * 0.6 > s) return r;
  return null;
}

export const hwRepair = {
  rep: null as RepLike | null,

  input(hw: Highway, ctl: { gas: number; brake: number; cruise: number }): void {
    const r = this.rep;
    road = hw.road;
    if (!r || !r.hwNoBrake) return;
    ctl.brake = 0;
    ctl.cruise = 0;
    if (r.hwBroken && !r.emg.active) ctl.gas = 0;
  },

  post(hw: Highway, dt: number): void {
    const r = this.rep;
    if (!r) return;
    const rig = hw.rig;
    road = hw.road;
    // a emergência e o botão de conserto rodam aqui (na estrada o passo do garimpo não roda)
    r.hwFrame(dt, rig.tr.yaw);
    if (r.emg.active) {
      // freio-motor + escape + cascalho; na subida da rampa a gravidade ajuda
      let a = r.hwDecel;
      const up = hw.road.rampAt(rig.s, rig.lat);
      if (up >= 0) a += 9.81 * (RAMP_RISE / RAMP_LEN) * 1.2;
      const v = rig.v;
      if (Math.abs(v) > 0.05) rig.v = Math.sign(v) * Math.max(0, Math.abs(v) - a * dt);
      return;
    }
    // sorteio: uma chance por rampa, uns 300 m antes, carregado e rápido
    if (!rig.coupled || rig.v < 13) return;
    let set = rolled.get(hw.road);
    if (!set) rolled.set(hw.road, (set = new Set()));
    for (const rp of hw.road.ramps) {
      const d = rp.s - rig.s;
      if (d < 260 || d > 340 || set.has(rp.s)) continue;
      set.add(rp.s);
      if (Math.random() < r.hwChance() * (rig.loadT > 2 ? 1 : 0.5)) r.brakeFailure(rig);
    }
  },

  onRamp(rig: Rig): boolean {
    return !!road && road.rampAt(rig.s, rig.lat) >= 0;
  },
  /** próxima rampa (posição no meio da faixa, um pouco para dentro) e distância */
  nextRamp(rig: Rig): { x: number; z: number; dist: number } | null {
    if (!road) return null;
    const r = rampAhead(road, rig.s);
    if (!r) return null;
    const s = Math.max(rig.s + 15, r.s + 10);
    road.sample(s, P);
    const lat = r.side * (HALF + 4);
    return { x: P[0] + Math.cos(P[3]) * lat, z: P[2] - Math.sin(P[3]) * lat, dist: Math.max(0, r.s - rig.s) };
  },

  /** enfeites da rampa no pedaço [s0, s1) */
  chunk(rd: Road, s0: number, s1: number, grp: THREE.Group): void {
    for (const r of rd.ramps) {
      if (r.s + RAMP_LEN + 10 < s0 || r.s - 280 > s1) continue;
      const pos = (s: number, lat: number, out: THREE.Vector3) => {
        rd.sample(s, P);
        out.set(P[0] + Math.cos(P[3]) * lat, rd.ground(s, lat, P[1]), P[2] - Math.sin(P[3]) * lat);
        return P[3];
      };
      const v = new THREE.Vector3();
      // faixa de cascalho (fita com textura seguindo o chão da rampa)
      const a0 = Math.max(s0, r.s - 40);
      const a1 = Math.min(s1, r.s + RAMP_LEN);
      if (a1 > a0) {
        const rows = Math.max(2, Math.ceil((a1 - a0) / 4) + 1);
        const P3 = new Float32Array(rows * 3 * 3);
        const UV = new Float32Array(rows * 3 * 2);
        const idx: number[] = [];
        for (let i = 0; i < rows; i++) {
          const s = Math.min(a1, a0 + i * 4);
          const w = RAMP_W * Math.min(1, Math.max(0, (s - (r.s - 40)) / 40));
          for (let k = 0; k < 3; k++) {
            const l = r.side * (HALF + 0.45 + (w + 0.1) * (k / 2));
            pos(s, l, v);
            const j = i * 3 + k;
            P3[j * 3] = v.x;
            P3[j * 3 + 1] = v.y + 0.06;
            P3[j * 3 + 2] = v.z;
            UV[j * 2] = (k / 2) * (w / 3);
            UV[j * 2 + 1] = s / 3;
            if (i < rows - 1 && k < 2) {
              if (r.side > 0) idx.push(j, j + 3, j + 1, j + 1, j + 3, j + 4);
              else idx.push(j, j + 1, j + 3, j + 1, j + 4, j + 3);
            }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        grp.add(new THREE.Mesh(geo, gravelMat()));
      }
      // placa 260 m antes e outra na entrada
      for (const ps of [r.s - 260, r.s - 45]) {
        if (ps < s0 || ps >= s1) continue;
        const h = pos(ps, r.side * (HALF + 3.2), v);
        const sg = rampSign();
        sg.position.set(v.x, v.y + 3, v.z);
        sg.rotation.y = h + Math.PI;
        grp.add(sg);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), poleMat());
        pole.position.set(v.x, v.y + 1.5, v.z);
        grp.add(pole);
      }
      // balizas zebradas nas duas bordas da faixa
      const geo = postGeo();
      for (let s = Math.max(r.s, Math.ceil(s0 / 10) * 10); s < Math.min(s1, r.s + RAMP_LEN); s += 10) {
        for (const l of [HALF + 0.5, HALF + 0.6 + RAMP_W]) {
          pos(s, r.side * l, v);
          const m = new THREE.Mesh(geo, ((s / 10) | 0) % 2 ? stripeMat(0) : stripeMat(1));
          m.position.set(v.x, v.y + 0.6, v.z);
          grp.add(m);
        }
      }
      // muro de pneus e areia no fim
      const se = r.s + RAMP_LEN - 4;
      if (se >= s0 && se < s1) {
        const tg = tyreGeo();
        for (let i = 0; i < 6; i++) {
          const h = pos(se, r.side * (HALF + 1.4 + i * 1.4), v);
          for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(tg, tyreMat());
            m.rotation.set(Math.PI / 2, 0, h);
            m.position.set(v.x, v.y + 0.2 + k * 0.38, v.z);
            grp.add(m);
          }
        }
        const sand = new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), sandMat());
        pos(se + 6, r.side * (HALF + 5), v);
        sand.scale.set(1.2, 0.5, 1);
        sand.position.copy(v);
        grp.add(sand);
      }
    }
  },
};

/* materiais/geometrias compartilhados (criados uma vez) */
let _post: THREE.CylinderGeometry | null = null;
let _tyre: THREE.TorusGeometry | null = null;
const _mats: Record<string, THREE.Material> = {};
const postGeo = () => (_post ??= new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6));
const tyreGeo = () => (_tyre ??= new THREE.TorusGeometry(0.45, 0.2, 6, 12));
const lamb = (k: string, c: number) => (_mats[k] ??= new THREE.MeshLambertMaterial({ color: c }));
const stripeMat = (i: number) => lamb('st' + i, i ? 0xff7a1a : 0xffffff);
const tyreMat = () => lamb('ty', 0x1c1c1f);
const sandMat = () => lamb('sd', 0xd8c08a);
const poleMat = () => lamb('pl', 0x8b9096);
const gravelMat = () => (_mats.gv ??= new THREE.MeshLambertMaterial({ map: gravel(), side: THREE.DoubleSide }));
