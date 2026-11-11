/* ============================================================
 *  MUNDO ABERTO — gerente do subsolo: quais pedaços viram volume,
 *  fila de malhas com orçamento (ms/quadro), cavar/encher com cópias
 *  consistentes nas bordas, consultas de densidade/chão/raio, save.
 * ============================================================ */
import * as THREE from 'three';
import { CH, RES, VN } from './gen';
import { Chunk, TREE_STRIDE, TState } from './chunk';
import { BED_Y, M, MATS, NSEC, SEC, Section, TOP_Y, VolChunk, VolGen, encodeSec, meshSection, takeFluid, takeMesh, type MeshCtx } from './vox';
import type { Phys } from './phys';

export interface VoxHost {
  chunks: Map<string, Chunk>;
  scene: THREE.Scene;
  groundMat: THREE.Material;
  waterMat: THREE.Material;
  gen: { height(x: number, z: number): number; seed: number; o?: { type: string }; skyIsland?(x: number, z: number, o: Float32Array): void };
}

const _pt = { d: 0, m: 0 };
const _col = new Float32Array(3);
const key = (cx: number, cz: number) => cx + ',' + cz;

interface Job {
  v: VolChunk;
  s: number;
  pri: number;
}

export class VoxWorld {
  readonly vg: VolGen;
  readonly lavaMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
  private jobs: Job[] = [];
  private wantT = 0;
  /** jogador (para prioridade e seções "perto") */
  px = 0;
  py = 0;
  pz = 0;
  budgetMs = 4;
  /** raio (pedaços) até onde bocas de caverna naturais viram volume */
  natR = 2;
  phys: Phys | null = null;
  onEditChunk: ((c: Chunk) => void) | null = null;
  /** edição feita (rede): centro, raio, material (−1 cava), dureza máxima */
  onEdit: ((x: number, y: number, z: number, r: number, fill: number, hard: number) => void) | null = null;
  private ctx: MeshCtx;

  constructor(private h: VoxHost) {
    this.vg = new VolGen(h.gen.seed);
    const gg = h.gen as { o?: { type: string }; skyIsland?: (x: number, z: number, o: Float32Array) => void };
    if (gg.o?.type === 'flutuantes' && gg.skyIsland) this.vg.sky = (x, z, o) => gg.skyIsland!(x, z, o);
    this.ctx = {
      sample: (x, y, z, o) => this.sample(x, y, z, o),
      grass: (c, lx, lz, out) => {
        const o = (lz * VN + lx) * 13;
        const col = c.col;
        const tn = col[o + 12];
        out[0] = (col[o] + (col[o + 3] - col[o]) * tn) * 0.97;
        out[1] = (col[o + 1] + (col[o + 4] - col[o + 1]) * tn) * 0.97;
        out[2] = (col[o + 2] + (col[o + 5] - col[o + 2]) * tn) * 0.97;
      },
      ownX: true,
      ownZ: true,
    };
  }

  /* ------------------------------ amostras ------------------------------ */

  /** densidade/material num ponto inteiro do mundo, em qualquer pedaço */
  sample(wx: number, wy: number, wz: number, out: { d: number; m: number }): void {
    const cx = Math.floor(wx / CH);
    const cz = Math.floor(wz / CH);
    const c = this.h.chunks.get(key(cx, cz));
    const lx = wx - cx * CH;
    const lz = wz - cz * CH;
    if (c && c.vol) {
      const v = c.vol;
      const s = Math.floor((wy - BED_Y) / SEC);
      if (s < 0 || s >= NSEC) {
        out.d = s < 0 ? 12 : -12;
        out.m = s < 0 ? M.RochaMae : M.Air;
        return;
      }
      if (v.secs[s]) {
        out.d = v.dAt(lx, wy, lz);
        out.m = v.mAt(lx, wy, lz);
        return;
      }
      // seção ainda não gerada: ponto direto do gerador
      const k = lz * VN + lx;
      _col[0] = v.colData[k * 3];
      _col[1] = v.colData[k * 3 + 1];
      _col[2] = v.colData[k * 3 + 2];
      this.vg.point(wx, wy, wz, v.hGen[k], _col, v.desert, out);
      return;
    }
    // pedaço só-heightfield: subsolo maciço (sem cavernas até virar volume)
    const H = c ? c.h[lz * VN + lx] : this.h.gen.height(wx, wz);
    const dep = H - wy;
    out.d = dep > 12.7 ? 12.7 : dep < -12.7 ? -12.7 : dep;
    out.m = dep <= 0 ? M.Air : dep < 1 ? M.Topo : dep < 3.5 ? M.Terra : dep < 8 ? M.Argila : wy > -24 ? M.Pedra : M.Funda;
    if (wy < BED_Y + 2) {
      out.d = 12.7;
      out.m = M.RochaMae;
    }
  }

  /** densidade contínua (m) em qualquer ponto */
  dens(x: number, y: number, z: number): number {
    const c = this.h.chunks.get(key(Math.floor(x / CH), Math.floor(z / CH)));
    if (!c) return this.h.gen.height(x, z) - y;
    if (c.vol) return c.vol.dens(x, y, z);
    if (y < BED_Y + 2) return 5;
    return c.hAt(x - c.x0, z - c.z0) - y;
  }
  /** material da amostra mais próxima */
  matAt(x: number, y: number, z: number): number {
    this.sample(Math.round(x), Math.round(y), Math.round(z), _pt);
    return _pt.m;
  }

  /** raio contra o terreno/cavernas: distância até bater (ou -1) */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    let prev = 0;
    let pd = this.dens(ox, oy, oz);
    if (pd > 0) return 0;
    for (let t = 0.2; t <= max; t += 0.2) {
      const d = this.dens(ox + dx * t, oy + dy * t, oz + dz * t);
      if (d > 0) {
        // refina
        let a = prev;
        let b = t;
        for (let k = 0; k < 5; k++) {
          const m = (a + b) / 2;
          if (this.dens(ox + dx * m, oy + dy * m, oz + dz * m) > 0) b = m;
          else a = m;
        }
        return b;
      }
      prev = t;
      pd = d;
    }
    return -1;
  }

  /* ------------------------------ volume ------------------------------ */

  /** boca de caverna ou ravina natural neste pedaço? (teste barato) */
  natural(c: Chunk): boolean {
    if (this.vg.sky) {
      const o = new Float32Array(2);
      for (let j = 0; j <= RES; j += 8) for (let i = 0; i <= RES; i += 8) {
        this.vg.sky(c.x0 + i, c.z0 + j, o);
        if (o[0] > 0) {
          c.skyTop = Math.max(c.skyTop, o[1] + 8);
          c.skyBot = Math.min(c.skyBot, o[1] - 28);
        }
      }
      if (c.skyTop > -1e8) return true;
    }
    for (let j = 2; j < RES; j += 7)
      for (let i = 2; i < RES; i += 7) {
        const wx = c.x0 + i;
        const wz = c.z0 + j;
        this.vg.column(wx, wz, _col);
        if (_col[0] <= 0 && _col[1] > 1) continue;
        const H = c.base[j * VN + i];
        for (const dep of [1.5, 3.5, 6]) {
          this.vg.point(wx, Math.round(H - dep), wz, H, _col, false, _pt);
          if (_pt.d <= 0) return true;
        }
      }
    return false;
  }

  makeVol(c: Chunk): VolChunk {
    if (c.vol) return c.vol;
    const v = new VolChunk(c, this.vg);
    c.vol = v;
    c.volReady = false;
    // vizinhos já volumétricos: as bordas deles mudam
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const n = this.h.chunks.get(key(c.cx + dx, c.cz + dz));
        if (n?.vol) for (const S of n.vol.secs) if (S?.mesh) this.dirty(n.vol, S, 5);
      }
    this.wantT = 0;
    return v;
  }

  /** faixa de seções que contém a superfície (mín/máx da coluna) */
  private band(v: VolChunk): [number, number] {
    const c = v.c;
    let mn = 1e9;
    let mx = -1e9;
    for (let k = 0; k < VN * VN; k++) {
      const a = v.hGen[k];
      const b = c.h[k];
      if (a < mn) mn = a;
      if (b < mn) mn = b;
      if (a > mx) mx = a;
      if (b > mx) mx = b;
    }
    const nat = c.natVol ? 6 : 0;
    const s0 = Math.max(0, Math.floor((mn - 2.5 - nat - BED_Y) / SEC));
    const s1 = Math.min(NSEC - 1, Math.floor((mx + 1.5 - BED_Y) / SEC));
    return [s0, s1];
  }

  private dirty(v: VolChunk, S: Section, pri: number): void {
    S.dirty = true;
    if (S.queued) {
      for (const j of this.jobs) if (j.v === v && j.s === S.s) j.pri = Math.min(j.pri, pri);
      return;
    }
    S.queued = true;
    this.jobs.push({ v, s: S.s, pri });
  }
  private want(v: VolChunk, s: number, pri: number): void {
    const S = v.secs[s];
    if (S && !S.dirty && (S.mesh || S.fluid || S.lava || S.pos === null)) {
      if (S.mesh || S.fluid || S.lava) return;
      if (!S.dirty) return;
    }
    this.dirty(v, v.sec(s), pri);
  }

  /** chame 1×/quadro */
  update(px: number, py: number, pz: number, dt: number): void {
    this.px = px;
    this.py = py;
    this.pz = pz;
    const pcx = Math.floor(px / CH);
    const pcz = Math.floor(pz / CH);
    this.wantT -= dt;
    if (this.wantT <= 0) {
      this.wantT = 0.3;
      const ps = Math.floor((py - BED_Y) / SEC);
      const under = py < this.surfaceAt(px, pz) - 3;
      for (const c of this.h.chunks.values()) {
        const dc = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
        if (!c.vol && c.natVol && dc <= this.natR) this.makeVol(c);
        // no subsolo, os pedaços vizinhos também viram volume (as cavernas continuam)
        if (!c.vol && under && dc <= 1) this.makeVol(c);
        const v = c.vol;
        if (!v) continue;
        const [s0, s1] = this.band(v);
        for (let s = s0; s <= s1; s++) this.want(v, s, dc * 2 + Math.abs(s - ps));
        if (c.skyTop > -1e8)
          for (let s = Math.max(0, Math.floor((c.skyBot - BED_Y) / SEC)); s <= Math.min(NSEC - 1, Math.floor((c.skyTop - BED_Y) / SEC)); s++) this.want(v, s, dc * 2 + Math.abs(s - ps));
        for (let s = 0; s < NSEC; s++) {
          const S = v.secs[s];
          if (S?.edited && (s < s0 || s > s1)) this.want(v, s, dc * 2 + Math.abs(s - ps));
        }
        if (dc <= 1)
          for (let s = Math.max(0, ps - 1); s <= Math.min(NSEC - 1, ps + 1); s++) this.want(v, s, dc + Math.abs(s - ps));
        // longe: desfaz seções "de passagem" (nem superfície nem editadas)
        for (let s = 0; s < NSEC; s++) {
          const S = v.secs[s];
          if (!S || S.edited || (s >= s0 && s <= s1)) continue;
          if (c.skyTop > -1e8 && s * SEC + BED_Y <= c.skyTop && (s + 1) * SEC + BED_Y >= c.skyBot) continue;
          if (dc > 2 || Math.abs(s - ps) > 2) this.dropMesh(v, S);
        }
      }
    }
    // física: trimesh só nos pedaços com toras/jogador por perto, 1 por quadro (é caro de montar)
    if (this.phys) {
      const ph = this.phys;
      let made = 0;
      const ps = Math.floor((py - BED_Y) / SEC);
      for (const c of this.h.chunks.values()) {
        const v = c.vol;
        if (!v) continue;
        const on = ph.active.has(c);
        for (let s = 0; s < NSEC; s++) {
          const S = v.secs[s];
          if (!S) continue;
          const k = c.key() + '/' + s;
          const has = ph.hasMesh(k);
          if (on && S.pos && !has && made < 1 && Math.abs(s - ps) <= 2) {
            ph.setMesh(k, S.pos, S.idx);
            made++;
          } else if (has && (!on || !S.pos)) ph.setMesh(k, null, null);
        }
      }
    }
    // processa a fila
    if (!this.jobs.length) return;
    this.jobs.sort((a, b) => a.pri - b.pri);
    const t0 = performance.now();
    let n = 0;
    while (this.jobs.length && (n === 0 || performance.now() - t0 < this.budgetMs)) {
      const j = this.jobs.shift()!;
      const c = j.v.c;
      if (!c.vol || this.h.chunks.get(c.key()) !== c) continue;
      const S = j.v.sec(j.s);
      S.queued = false;
      if (!S.dirty) continue;
      this.remesh(j.v, S);
      n++;
    }
  }

  surfaceAt(x: number, z: number): number {
    const c = this.h.chunks.get(key(Math.floor(x / CH), Math.floor(z / CH)));
    if (!c) return this.h.gen.height(x, z);
    return c.hAt(x - c.x0, z - c.z0);
  }

  private dropMesh(v: VolChunk, S: Section): void {
    for (const k of ['mesh', 'fluid', 'lava'] as const) {
      const m = S[k];
      if (m) {
        this.h.scene.remove(m);
        m.geometry.dispose();
        S[k] = null;
      }
    }
    S.pos = null;
    S.idx = null;
    S.dirty = true;
    this.phys?.setMesh(v.c.key() + '/' + S.s, null, null);
  }

  remesh(v: VolChunk, S: Section): void {
    const c = v.c;
    this.ctx.ownX = !this.h.chunks.get(key(c.cx + 1, c.cz))?.vol;
    this.ctx.ownZ = !this.h.chunks.get(key(c.cx, c.cz + 1))?.vol;
    const { nv, ni, nf } = meshSection(v, S, this.ctx);
    for (const k of ['mesh', 'fluid', 'lava'] as const) {
      const m = S[k];
      if (m) {
        this.h.scene.remove(m);
        m.geometry.dispose();
        S[k] = null;
      }
    }
    S.dirty = false;
    S.pos = null;
    S.idx = null;
    if (ni > 0) {
      const { g, pos, idx } = takeMesh(nv, ni);
      const m = new THREE.Mesh(g, this.h.groundMat);
      m.matrixAutoUpdate = false;
      m.receiveShadow = true;
      this.h.scene.add(m);
      S.mesh = m;
      S.pos = pos;
      S.idx = idx;
    }
    if (nf > 0) {
      const wg = takeFluid(nf, false);
      if (wg) {
        const m = new THREE.Mesh(wg, this.h.waterMat);
        m.matrixAutoUpdate = false;
        m.renderOrder = 2;
        this.h.scene.add(m);
        S.fluid = m;
      }
      const lg = takeFluid(nf, true);
      if (lg) {
        const m = new THREE.Mesh(lg, this.lavaMat);
        m.matrixAutoUpdate = false;
        this.h.scene.add(m);
        S.lava = m;
      }
    }
    // trimesh velho fica inválido: refeito pelo update (se ainda houver algo físico perto)
    if (this.phys?.hasMesh(c.key() + '/' + S.s)) this.phys.setMesh(c.key() + '/' + S.s, null, null);
    // a faixa da superfície ficou pronta? esconde o heightfield
    if (!c.volReady) {
      const [s0, s1] = this.band(v);
      let ok = true;
      for (let s = s0; s <= s1; s++) {
        const T = v.secs[s];
        if (!T || T.dirty) ok = false;
      }
      if (ok) {
        c.volReady = true;
        if (c.mesh) c.mesh.visible = false;
        if (c.natVol) this.fixSurface(v);
      }
    }
  }

  /** pedaços naturais: o topo real (ravinas/bocas) vira o "h" da superfície; árvores no vazio somem */
  private fixSurface(v: VolChunk): void {
    const c = v.c;
    for (let j = 0; j < VN; j++)
      for (let i = 0; i < VN; i++) {
        const k = j * VN + i;
        const o = k * 3;
        if (v.colData[o] <= 0 && v.colData[o + 1] > 6) continue;
        c.h[k] = v.topAt(i, j, v.hGen[k] + 2);
      }
    for (let t = 0; t < c.nt; t++) {
      const o = t * TREE_STRIDE;
      const y = c.hAt(c.trees[o] - c.x0, c.trees[o + 2] - c.z0);
      if (Math.abs(y - c.trees[o + 1]) > 0.8) c.tstate[t] = TState.Gone;
    }
    c.treesDirty = true;
    this.onEditChunk?.(c);
  }

  /* ------------------------------ edição ------------------------------ */

  /**
   * Cava (r > 0, fill=-1) ou enche (fill = material) uma esfera.
   * Amostras mais duras que `maxHard` ficam. Conta materiais removidos/colocados em `counts`.
   * Devolve quantas amostras mudaram de estado; `blocked` conta as duras demais.
   */
  edit(x: number, y: number, z: number, r: number, fill: number, maxHard: number, counts: Map<number, number>, stat = { blocked: 0 }): number {
    if (y + r > TOP_Y - 1) return 0;
    const x0 = Math.floor(x - r - 1);
    const x1 = Math.ceil(x + r + 1);
    const y0 = Math.max(BED_Y, Math.floor(y - r - 1));
    const y1 = Math.min(TOP_Y - 1, Math.ceil(y + r + 1));
    const z0 = Math.floor(z - r - 1);
    const z1 = Math.ceil(z + r + 1);
    // pedaços tocados viram volume
    const touched = new Set<Chunk>();
    for (let cz = Math.floor((z0 - 1) / CH); cz <= Math.floor((z1 + 1) / CH); cz++)
      for (let cx = Math.floor((x0 - 1) / CH); cx <= Math.floor((x1 + 1) / CH); cx++) {
        const c = this.h.chunks.get(key(cx, cz));
        if (!c) continue;
        this.makeVol(c);
        touched.add(c);
      }
    let changed = 0;
    for (let wz = z0; wz <= z1; wz++)
      for (let wy = y0; wy <= y1; wy++)
        for (let wx = x0; wx <= x1; wx++) {
          const dist = Math.sqrt((wx - x) ** 2 + (wy - y) ** 2 + (wz - z) ** 2);
          if (dist > r + 1) continue;
          const pc = this.h.chunks.get(key(Math.floor(wx / CH), Math.floor(wz / CH)));
          if (!pc || !pc.vol) continue;
          const lx = wx - pc.x0;
          const lz = wz - pc.z0;
          const od = pc.vol.dAt(lx, wy, lz);
          const om = pc.vol.mAt(lx, wy, lz);
          let nd: number;
          let nm = om;
          if (fill < 0) {
            nd = Math.min(od, dist - r);
            if (od > 0 && nd <= 0) {
              const mi = MATS[om];
              if (!mi || mi.hard > maxHard) {
                stat.blocked++;
                continue;
              }
              counts.set(om, (counts.get(om) ?? 0) + 1);
              nm = M.Air;
              changed++;
            } else if (od > 0 && (MATS[om]?.hard ?? 99) > maxHard) continue;
          } else {
            nd = Math.max(od, r - dist);
            if (od <= 0 && nd > 0) {
              counts.set(fill, (counts.get(fill) ?? 0) + 1);
              nm = fill;
              changed++;
            }
          }
          if (nd === od && nm === om) continue;
          this.setAll(wx, wy, wz, nd, nm);
        }
    // seções a refazer (inclui as que usam estas amostras como borda)
    for (const c of touched) {
      const v = c.vol!;
      c.modified = true;
      const s0 = Math.max(0, Math.floor((y0 - 1 - BED_Y) / SEC));
      const s1 = Math.min(NSEC - 1, Math.floor((y1 + 1 - BED_Y) / SEC));
      for (let s = s0; s <= s1; s++) this.dirty(v, v.sec(s), -1);
      // topo da superfície nas colunas tocadas
      const i0 = Math.max(0, x0 - c.x0);
      const i1 = Math.min(RES, x1 - c.x0);
      const j0 = Math.max(0, z0 - c.z0);
      const j1 = Math.min(RES, z1 - c.z0);
      if (i0 <= i1 && j0 <= j1) {
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const k = j * VN + i;
            const top = Math.max(c.h[k], v.hGen[k]) + (fill >= 0 ? r + 2 : 1);
            if (y - r - 1 > c.h[k] + 0.5 && fill < 0) continue; // escavou no ar? nada
            const nh = v.topAt(i, j, Math.min(TOP_Y - 2, top));
            c.h[k] = nh;
            if (nh < c.minY) c.minY = nh;
            if (nh > c.maxY) c.maxY = nh;
          }
        c.treesDirty = true;
      }
      this.onEditChunk?.(c);
    }
    // refaz já as seções mais perto (resposta imediata), o resto na fila
    this.jobs.sort((a, b) => a.pri - b.pri);
    let n = 0;
    while (this.jobs.length && this.jobs[0].pri < 0 && n < 3) {
      const j = this.jobs.shift()!;
      const S = j.v.sec(j.s);
      S.queued = false;
      if (S.dirty && j.v.c.vol) this.remesh(j.v, S);
      n++;
    }
    for (const j of this.jobs) if (j.pri < 0) j.pri = 0;
    if (changed > 0) this.onEdit?.(x, y, z, r, fill, maxHard);
    return changed;
  }

  /** grava a amostra em todas as cópias (bordas de pedaço e de seção) */
  private setAll(wx: number, wy: number, wz: number, d: number, m: number): void {
    let q = Math.round(d * 10);
    if (q > 127) q = 127;
    else if (q < -127) q = -127;
    const cx = Math.floor(wx / CH);
    const cz = Math.floor(wz / CH);
    const s = Math.floor((wy - BED_Y) / SEC);
    const ly = wy - BED_Y - s * SEC;
    for (let a = 0; a < 2; a++) {
      const ccx = cx - a;
      const lx = wx - ccx * CH;
      if (lx > CH) continue;
      if (a === 1 && lx !== CH) continue;
      for (let b = 0; b < 2; b++) {
        const ccz = cz - b;
        const lz = wz - ccz * CH;
        if (b === 1 && lz !== CH) continue;
        const c = this.h.chunks.get(key(ccx, ccz));
        if (!c) continue;
        const v = c.vol ?? this.makeVol(c);
        for (let e = 0; e < 2; e++) {
          const ss = s - e;
          const yy = e ? ly + SEC : ly;
          if (e === 1 && ly !== 0) continue;
          if (ss < 0 || ss >= NSEC) continue;
          const S = v.sec(ss);
          S.markEdit();
          const i = lx + yy * (CH + 1) + lz * (CH + 1) * (SEC + 1);
          S.d[i] = q;
          S.m[i] = m;
          c.modified = true;
        }
      }
    }
  }

  /* ------------------------------ save ------------------------------ */

  encode(c: Chunk): Record<string, string> | null {
    const v = c.vol;
    if (!v) return null;
    const out: Record<string, string> = {};
    let any = false;
    for (let s = 0; s < NSEC; s++) {
      const S = v.secs[s];
      const p = S ? encodeSec(S) : v.pend[s];
      if (p) {
        out[s] = p;
        any = true;
      }
    }
    return any ? out : null;
  }
  decode(c: Chunk, rec: Record<string, string>): void {
    const v = this.makeVol(c);
    for (const k of Object.keys(rec)) {
      const s = +k;
      if (s >= 0 && s < NSEC && typeof rec[k] === 'string') v.pend[s] = rec[k];
    }
  }

  forget(c: Chunk): void {
    const v = c.vol;
    if (!v) return;
    for (const S of v.secs) if (S) this.dropMesh(v, S);
    this.jobs = this.jobs.filter((j) => j.v !== v);
  }

  dispose(): void {
    for (const c of this.h.chunks.values()) this.forget(c);
    this.jobs.length = 0;
  }
}
