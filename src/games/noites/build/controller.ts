/* ============================================================
 *  NOITES · CONSTRUÇÃO — controlador local (lado do jogador).
 *  Mira = raio do centro da câmera (1ª/3ª pessoa) ou toque no chão
 *  (fixa o fantasma até andar/virar). Fila: arrastar o fantasma com
 *  o dedo, ou segurar ✓ e virar/andar. Host-autoritativo: só manda
 *  a ação; o host valida e todos recebem a lista.
 *
 *  API para o inventário (wip/noites2):
 *    build.open() / close() / toggle() / active
 *    build.enterPlacement('fence')          // entra direto colocando uma peça
 *    build.rotate() / place() / cancel()    // girar 90°, confirmar, sair
 *    build.tool('del' | 'fix' | 'up')       // desmontar / consertar / melhorar
 *    build.canAfford(cost)                  // usa build/res.ts (adaptador)
 *    build.serialize() / build.load(data)   // peças da partida
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { tap, success } from '../../../core/haptics';
import { sfx } from '../../../3d/common/sfx';
import { surfaceOf, type TouchClaimer } from '../../../ui/touch/surface';
import { IGNORE_SEL } from '../../../ui/touch/surface';
import { notify } from '../../../ui/notify';
import { resName, type Res } from '../data';
import type { Action, Ev, Player, Sim } from '../sim';
import type { View } from '../view';
import { speak } from '../speak';
import { bic } from './icons';
import { CELL, LINE_MAX, PIECE, PIECES, REACH, addCost, refundOf, repairOf, variantOf, type Cost, type PK, type PieceDef } from './pieces';
import { affordCount, canAfford as resAfford, have, benchLevel } from './res';
import { cellOf, keyOf, type BPiece, type Reason } from './state';
import { BuildUI, TOOL_ICON, chips, toolName, toolSay, type Tool } from './ui';
import type { GhostCell, GhostView } from './view';

export interface BuildHost {
  wrap: HTMLElement;
  sim(): Sim | null;
  view(): View | null;
  me(): Player | undefined;
  send(a: Action): void;
  /** algo impede construir agora (bancada aberta, garagem, veículo, desmaiado) */
  busy(): boolean;
}
type Mode = 'place' | Tool;

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export function reasonText(r: Reason, d?: PieceDef, res?: Res | null): string {
  switch (r) {
    case 'far':
      return t('nbuild.r.far', 'Chegue mais perto.');
    case 'fire':
      return t('nbuild.r.fire', 'Perto demais da fogueira.');
    case 'edge':
      return t('nbuild.r.edge', 'Longe demais do acampamento.');
    case 'occ':
      return t('nbuild.r.occ', 'Já tem uma peça aqui.');
    case 'block':
      return t('nbuild.r.block', 'Tem algo no caminho.');
    case 'crowd':
      return t('nbuild.r.crowd', 'Tem alguém em pé aqui.');
    case 'tier':
      return t('nbuild.r.tier', 'Precisa da Bancada nível {n}.', { n: d?.bench ?? 2 });
    case 'res':
      return t('nbuild.r.res', 'Falta {x}!', { x: res ? resName(res) : '' });
    case 'none':
      return t('nbuild.r.none', 'Nada para fazer aqui.');
    case 'full':
      return t('nbuild.r.full', 'Não dá para melhorar mais.');
    default:
      return '';
  }
}
const REASON_ICON: Record<string, string> = { far: 'far', fire: 'zone', edge: 'far', occ: 'occ', block: 'block', crowd: 'crowd', tier: 'tier', none: 'none', full: 'tier' };

export class BuildController {
  active = false;
  mode: Mode = 'place';
  piece: PK = 'fence';
  /** rotação em oitavos de volta */
  ro = 0;
  free = false;
  /** altura do ponto de mira na tela (NDC −1..1). 3ª pessoa: acima da cabeça; 1ª pessoa: use 0 */
  aimY = 0.3;
  /** 3ª pessoa: ao construir, a câmera sobe e afasta um pouco (o fantasma fica acima da cabeça). 1ª pessoa: desligue */
  camAssist = true;
  private camPrev: { pitch: number; dist: number } | null = null;
  /** o jogador girou (senão a peça vira de frente para a câmera) */
  private userRot = false;
  private ui: BuildUI;
  private pin: { x: number; z: number; px: number; pz: number; yaw: number } | null = null;
  private drag: { ax: number; az: number; bx: number; bz: number; by: 'ok' | 'touch'; moved: boolean } | null = null;
  /** célula mirada (já na grade) e o ponto cru da mira */
  aim: [number, number] = [0, 0];
  rawAim: [number, number] = [0, 0];
  private cells: GhostCell[] = [];
  private targets: BPiece[] = [];
  private why: Reason = '';
  private whyRes: Res | null = null;
  private okCount = 0;
  private claim: TouchClaimer;
  private tapDown: { id: number; x: number; y: number; t: number } | null = null;
  private offs: (() => void)[] = [];
  private lastCells = '';

  constructor(private host: BuildHost) {
    this.ui = new BuildUI(host.wrap, {
      toggle: () => this.toggle(),
      pick: (id) => (id === 'del' || id === 'fix' || id === 'up' ? this.tool(id) : this.enterPlacement(id)),
      confirmDown: () => this.okDown(),
      confirmUp: () => this.okUp(),
      rotate: () => this.rotate(),
      exit: () => this.close(),
      free: () => this.toggleFree(),
      palette: (on) => (on ? this.openPalette() : this.ui.closePalette()),
    });
    // arrastar o fantasma com o dedo (prioridade acima do "olhar")
    this.claim = {
      priority: 10,
      wants: (_e, x, y) => this.active && !this.ui.paletteOpen && this.nearGhost(x, y),
      down: (_e, x, y) => this.touchDown(x, y),
      move: (_e, x, y) => this.touchMove(x, y),
      up: () => this.touchUp(),
    };
    surfaceOf(host.wrap).add(this.claim);
    // toque rápido no chão: fixa o fantasma ali
    const pd = (e: PointerEvent) => {
      const tg = e.target as Element | null;
      if (!this.active || (tg && tg !== host.wrap && tg.closest?.(IGNORE_SEL + ',.nb-pal,.nc-panel'))) return;
      this.tapDown = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const pu = (e: PointerEvent) => {
      const d = this.tapDown;
      this.tapDown = null;
      if (!d || d.id !== e.pointerId || !this.active || this.drag) return;
      if (performance.now() - d.t > 320 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
      const r = host.wrap.getBoundingClientRect();
      const hit = this.ray(e.clientX - r.left, e.clientY - r.top);
      const me = host.me();
      if (!hit || !me) return;
      if (Math.hypot(hit[0] - me.x, hit[1] - me.z) > REACH + 2) return;
      this.pin = { x: hit[0], z: hit[1], px: me.x, pz: me.z, yaw: host.view()?.camYaw ?? 0 };
      tap('light');
    };
    host.wrap.addEventListener('pointerdown', pd, true);
    window.addEventListener('pointerup', pu, true);
    this.offs.push(() => {
      host.wrap.removeEventListener('pointerdown', pd, true);
      window.removeEventListener('pointerup', pu, true);
    });
  }

  /* ------------------------------ API ------------------------------ */
  get def(): PieceDef {
    return PIECE[this.piece];
  }
  private activate(): void {
    this.active = true;
    this.ui.setActive(true);
    const v = this.host.view();
    if (v && this.camAssist && !this.camPrev) {
      this.camPrev = { pitch: v.camPitch, dist: v.camDist };
      v.camPitch = Math.max(v.camPitch, 0.78);
      v.camDist = Math.max(v.camDist, 8.4);
    }
  }
  open(): void {
    if (this.host.busy()) return;
    this.activate();
    this.openPalette();
    sfx.click();
  }
  close(): void {
    this.active = false;
    this.drag = null;
    this.pin = null;
    this.ui.setActive(false);
    this.ui.closePalette();
    this.ui.pressOk(false);
    const v = this.host.view();
    if (v) {
      v.build.ghost = null;
      if (this.camPrev) {
        v.camPitch = this.camPrev.pitch;
        v.camDist = this.camPrev.dist;
      }
    }
    this.camPrev = null;
  }
  toggle(): void {
    if (this.active) this.close();
    else this.open();
  }
  /** entra no modo construção já com a peça escolhida */
  enterPlacement(id: PK): void {
    if (!PIECE[id]) return;
    if (!this.active) {
      if (this.host.busy()) return;
      this.activate();
    }
    this.ui.closePalette();
    this.mode = 'place';
    this.piece = id;
    this.userRot = false;
    this.free = this.free && !!this.def.decor;
    if (!this.def.decor) this.ro &= 6;
    speak(this.def.say(), { cool: 4000 });
  }
  tool(k: Tool): void {
    if (!this.active) {
      if (this.host.busy()) return;
      this.activate();
    }
    this.ui.closePalette();
    this.mode = k;
    speak(toolSay(k), { cool: 4000 });
  }
  /** gira 90° (livre: 45°) */
  rotate(): void {
    this.userRot = true;
    this.ro = (this.ro + (this.free ? 1 : 2)) & 7;
    tap('light');
    sfx.click();
  }
  /** confirma no lugar do fantasma (uma peça, ou a fila se estiver arrastando) */
  place(): void {
    this.commit();
  }
  cancel(): void {
    if (this.drag) {
      this.drag = null;
      this.ui.pressOk(false);
      return;
    }
    this.close();
  }
  canAfford(cost: Cost, mul = 1): boolean {
    const s = this.host.sim();
    return !!s && resAfford(s, this.host.me(), cost, mul);
  }
  serialize(): unknown {
    return this.host.sim()?.build.serialize() ?? null;
  }
  load(data: unknown): void {
    this.host.sim()?.build.load(data);
  }
  toggleFree(): void {
    if (!this.def.decor) return;
    this.free = !this.free;
    if (!this.free) this.ro &= 6;
    this.pin = null;
    tap('light');
    speak(this.free ? t('nbuild.say.freeOn', 'Modo livre: põe em qualquer lugar.') : t('nbuild.say.gridOn', 'Modo grade: tudo alinhadinho.'), { cool: 1500, urgent: true });
  }
  private openPalette(): void {
    const s = this.host.sim();
    if (!s) return;
    const me = this.host.me();
    this.ui.openPalette(
      (id) => {
        const d = PIECE[id];
        return { ok: resAfford(s, me, d.cost), lock: (d.bench ?? 0) > benchLevel(s) ? d.bench ?? 0 : 0 };
      },
      (r) => have(s, me, r),
      this.mode === 'place' ? this.piece : this.mode,
    );
    speak(t('nbuild.say.palette', 'O que vamos construir?'), { cool: 20000 });
  }

  /* ------------------------------ mira ------------------------------ */
  /** raio da tela (px CSS relativos ao wrap) até o chão */
  private ray(sx: number, sy: number): [number, number] | null {
    const v = this.host.view();
    const s = this.host.sim();
    const me = this.host.me();
    if (!v || !s || !me) return null;
    const w = this.host.wrap.clientWidth || innerWidth;
    const h = this.host.wrap.clientHeight || innerHeight;
    return this.rayNdc((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
  }
  private rayNdc(nx: number, ny: number): [number, number] | null {
    const v = this.host.view();
    const s = this.host.sim();
    const me = this.host.me();
    if (!v || !s || !me) return null;
    const cam = v.camera;
    _v.copy(cam.position);
    _d.set(nx, ny, 0.5).unproject(cam).sub(_v).normalize();
    if (_d.y > -0.02) return null;
    let gy = s.w.height(me.x, me.z);
    let tt = (gy - _v.y) / _d.y;
    for (let i = 0; i < 2; i++) {
      gy = s.w.height(_v.x + _d.x * tt, _v.z + _d.z * tt);
      tt = (gy - _v.y) / _d.y;
    }
    return [_v.x + _d.x * tt, _v.z + _d.z * tt];
  }
  private centerAim(me: Player): [number, number] {
    const v = this.host.view()!;
    let hit = this.rayNdc(0, this.aimY);
    const yaw = v.camYaw;
    if (!hit) hit = [me.x + Math.sin(yaw) * (REACH - 2), me.z + Math.cos(yaw) * (REACH - 2)];
    let dx = hit[0] - me.x;
    let dz = hit[1] - me.z;
    let d = Math.hypot(dx, dz);
    const max = REACH - 1.5;
    if (d > max) {
      dx *= max / d;
      dz *= max / d;
      d = max;
    }
    if (d < 1.6) {
      dx = Math.sin(yaw) * 1.8;
      dz = Math.cos(yaw) * 1.8;
    }
    return [me.x + dx, me.z + dz];
  }
  private snap(x: number, z: number): [number, number] {
    if (this.mode === 'place' && this.free && this.def.decor) return [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
    return [cellOf(x) * CELL, cellOf(z) * CELL];
  }
  private nearGhost(x: number, y: number): boolean {
    const v = this.host.view();
    const s = this.host.sim();
    if (!v || !s) return false;
    const [ax, az] = this.aim;
    const p = v.project(ax, s.w.height(ax, az) + 0.5, az);
    return p.front && Math.hypot(p.x - x, p.y - y) < 70;
  }

  /* ------------------------------ fila (arrastar) ------------------------------ */
  private okDown(): void {
    if (!this.active) return;
    this.ui.pressOk(true);
    tap('medium');
    const [x, z] = this.aim;
    this.drag = { ax: x, az: z, bx: x, bz: z, by: 'ok', moved: false };
  }
  private okUp(): void {
    this.ui.pressOk(false);
    if (!this.drag || this.drag.by !== 'ok') return;
    this.commit();
  }
  private touchDown(x: number, y: number): void {
    const [ax, az] = this.aim;
    this.drag = { ax, az, bx: ax, bz: az, by: 'touch', moved: false };
    this.tapDown = null;
    void x;
    void y;
    tap('light');
  }
  private touchMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    const hit = this.ray(x, y);
    if (!hit) return;
    const [bx, bz] = this.snap(hit[0], hit[1]);
    if (bx !== d.bx || bz !== d.bz) {
      d.bx = bx;
      d.bz = bz;
      d.moved = true;
      tap('light');
      sfx.click();
    }
  }
  private touchUp(): void {
    if (!this.drag || this.drag.by !== 'touch') return;
    this.commit();
  }
  /** células da fila: reta pelo eixo dominante, no máximo LINE_MAX */
  private lineCells(): [number, number][] {
    const d = this.drag;
    const [ax, az] = d ? this.snap(d.ax, d.az) : this.aim;
    if (!d || (this.mode === 'place' && this.free)) return [[ax, az]];
    const [bx, bz] = this.snap(d.bx, d.bz);
    const ca = [cellOf(ax), cellOf(az)];
    const cb = [cellOf(bx), cellOf(bz)];
    const dx = cb[0] - ca[0];
    const dz = cb[1] - ca[1];
    const out: [number, number][] = [];
    const horiz = Math.abs(dx) >= Math.abs(dz);
    const n = Math.min(LINE_MAX - 1, Math.abs(horiz ? dx : dz));
    const sx = horiz ? Math.sign(dx) : 0;
    const sz = horiz ? 0 : Math.sign(dz);
    for (let i = 0; i <= n; i++) out.push([(ca[0] + sx * i) * CELL, (ca[1] + sz * i) * CELL]);
    return out;
  }

  /* ------------------------------ quadro ------------------------------ */
  update(_dt: number): void {
    const s = this.host.sim();
    const v = this.host.view();
    const me = this.host.me();
    this.ui.showToggle(!!s && !!me && !this.host.busy());
    if (!this.active || !s || !v || !me) {
      if (v) v.build.ghost = null;
      return;
    }
    if (this.host.busy()) return this.close();
    // mira: toque fixado (até andar/virar) ou centro da câmera
    if (this.pin && (Math.hypot(me.x - this.pin.px, me.z - this.pin.pz) > 0.8 || Math.abs(Math.atan2(Math.sin(v.camYaw - this.pin.yaw), Math.cos(v.camYaw - this.pin.yaw))) > 0.3)) this.pin = null;
    const raw: [number, number] = this.pin ? [this.pin.x, this.pin.z] : this.centerAim(me);
    this.rawAim = raw;
    if (this.drag?.by === 'ok') {
      [this.drag.bx, this.drag.bz] = raw;
    }
    if (!this.drag || this.drag.by === 'ok') this.aim = this.snap(raw[0], raw[1]);
    if (this.drag?.by === 'ok') {
      const [ax, az] = this.snap(this.drag.ax, this.drag.az);
      if (ax !== this.aim[0] || az !== this.aim[1]) this.drag.moved = true;
    }
    if (this.mode === 'place' && !this.userRot && !this.drag) {
      // de frente para a câmera: trecho de cerca atravessado na tela, móveis virados para o jogador
      const q = Math.round(v.camYaw / (Math.PI / 2)) & 3;
      this.ro = this.def.arms || this.def.id === 'gate' ? (q % 2 ? 0 : 2) : ((q + 2) & 3) * 2;
    }
    const pts = this.lineCells();
    const key = pts.map((p) => p.join(',')).join(';') + this.mode + this.piece + this.ro;
    if (key !== this.lastCells && this.lastCells && pts.length > 1) tap('light');
    this.lastCells = key;
    if (this.mode === 'place') this.ghostPlace(s, me, pts);
    else this.ghostTool(s, me, pts);
    // interface
    const d = this.def;
    const icon = this.mode === 'place' ? d.icon : TOOL_ICON[this.mode];
    this.ui.setCurrent(icon, this.mode === 'place' && (d.icon === 'torch' || d.icon === 'fire' || d.icon === 'chest' || d.icon === 'bed' || d.icon === 'bench') ? d.col : '', this.mode === 'place', this.mode === 'place' && !!d.decor, this.free, this.mode);
    this.updInfo(s, me);
    const bad = this.cells.find((c) => !c.ok) ?? (this.mode !== 'place' && this.why ? { x: this.aim[0], z: this.aim[1] } : null);
    const g: GhostView = {
      mode: this.mode,
      cells: this.cells,
      hl: this.targets.map((p) => p.id),
      reason: this.why ? (this.why === 'res' ? this.whyRes ?? 'wood' : REASON_ICON[this.why] ?? 'help') : '',
      rx: bad ? bad.x : this.aim[0],
      rz: bad ? bad.z : this.aim[1],
      gx: this.aim[0],
      gz: this.aim[1],
      free: this.mode === 'place' && this.free,
    };
    v.build.ghost = g;
  }
  private ghostPlace(s: Sim, me: Player, pts: [number, number][]): void {
    const d = this.def;
    const B = s.build;
    const pend = new Set<number>();
    const keys = new Set<number>(d.link && !this.free ? pts.map(([x, z]) => keyOf(cellOf(x), cellOf(z))) : []);
    const can = affordCount(s, me, d.cost);
    this.cells = [];
    this.targets = [];
    this.why = '';
    this.whyRes = null;
    let ok = 0;
    for (const [x, z] of pts) {
      let r = B.check(d, x, z, this.ro, this.free, me, pend);
      if (!r && ok >= can) r = 'res';
      if (!r) {
        ok++;
        if (!this.free) pend.add(keyOf(cellOf(x), cellOf(z)));
      } else if (!this.why) {
        this.why = r;
        if (r === 'res') this.whyRes = (Object.keys(d.cost) as Res[]).find((k) => have(s, me, k) < (d.cost[k] ?? 0) * (ok + 1)) ?? null;
      }
      let shape = 0;
      let rot = (this.ro * Math.PI) / 4;
      if (!this.free) {
        const cx = cellOf(x);
        const cz = cellOf(z);
        const own = keyOf(cx, cz);
        keys.delete(own);
        [shape, rot] = variantOf(d, B.maskAt(cx, cz, keys), this.ro);
        if (d.link) keys.add(own);
      }
      this.cells.push({ x, z, ok: !r, kind: d.id, shape, rot });
    }
    this.okCount = ok;
  }
  private ghostTool(s: Sim, me: Player, pts: [number, number][]): void {
    const B = s.build;
    const seen = new Set<number>();
    this.cells = [];
    this.targets = [];
    this.why = '';
    this.whyRes = null;
    let need: Cost = {};
    for (const [x, z] of pts) {
      const p = B.pieceAt(x, z);
      if (!p || seen.has(p.id) || Math.hypot(p.x - me.x, p.z - me.z) > REACH + 2) continue;
      seen.add(p.id);
      const d = PIECES[p.k];
      if (this.mode === 'fix') {
        if (p.hp >= d.hp - 0.01) continue;
        need = addCost(need, repairOf(d, p.hp));
      } else if (this.mode === 'up') {
        if (!d.up) {
          this.why ||= 'full';
          continue;
        }
        const u = PIECE[d.up];
        if ((u.bench ?? 0) > benchLevel(s)) {
          this.why ||= 'tier';
          continue;
        }
        need = addCost(need, u.cost);
      }
      this.targets.push(p);
    }
    if (!this.targets.length) {
      this.why ||= 'none';
    } else if (this.mode !== 'del' && !resAfford(s, me, need)) {
      this.why = 'res';
      this.whyRes = (Object.keys(need) as Res[]).find((k) => have(s, me, k) < (need[k] ?? 0)) ?? null;
    } else this.why = '';
    this.okCount = this.targets.length;
  }
  private updInfo(s: Sim, me: Player): void {
    const hv = (r: Res) => have(s, me, r);
    let html = '';
    let n = '';
    const bad = !!this.why;
    if (this.mode === 'place') {
      const d = this.def;
      const cnt = this.cells.length;
      html = `${bic(d.icon, 22, d.icon === 'torch' || d.icon === 'fire' ? d.col : '')}<span>${d.n()}</span>${cnt > 1 ? `<span class="x">×${this.okCount}</span>` : ''}${chips(d.cost, hv, Math.max(1, this.okCount))}`;
      n = cnt > 1 ? String(this.okCount) : '';
    } else {
      const k = this.mode;
      html = `${bic(TOOL_ICON[k], 22)}<span>${toolName(k)}</span>`;
      if (this.targets.length) {
        let c: Cost = {};
        for (const p of this.targets) {
          const d = PIECES[p.k];
          c = addCost(c, k === 'del' ? refundOf(d, Math.max(0, p.hp) / d.hp) : k === 'fix' ? repairOf(d, p.hp) : PIECE[d.up!].cost);
        }
        html += k === 'del' ? `<span class="x">+</span>${chips(c)}` : chips(c, hv);
        if (k === 'up') html += `<span class="x">→</span>${bic(PIECE[PIECES[this.targets[0].k].up!].icon, 22)}`;
        n = this.targets.length > 1 ? String(this.targets.length) : '';
      }
    }
    if (bad) html += `<span class="why">${reasonText(this.why, this.def, this.whyRes)}</span>`;
    this.ui.setInfo(html, bad, n);
  }

  /* ------------------------------ confirmar ------------------------------ */
  private commit(): void {
    const s = this.host.sim();
    const me = this.host.me();
    const wasLine = !!this.drag?.moved;
    this.drag = null;
    if (!s || !me || !this.active) return;
    if (this.mode === 'place') {
      const ok = this.cells.filter((c) => c.ok);
      if (!ok.length) {
        const txt = reasonText(this.why || 'occ', this.def, this.whyRes);
        speak(txt, { cool: 1200, urgent: true });
        tap('heavy');
        sfx.bump();
        return;
      }
      const c: number[] = [];
      for (const q of ok) c.push(Math.round(q.x * 10), Math.round(q.z * 10));
      this.host.send({ a: 'build', o: 'p', k: this.def.idx, c, r: this.ro, f: this.free ? 1 : 0 });
      tap('medium');
      if (ok.length >= 3) success();
      if (wasLine && ok.length > 1) speak(t('nbuild.say.line', '{n} peças!', { n: ok.length }), { cool: 1500 });
      return;
    }
    if (!this.targets.length || (this.why && this.why !== 'full')) {
      speak(reasonText(this.why || 'none', this.def, this.whyRes), { cool: 1200, urgent: true });
      tap('heavy');
      sfx.bump();
      return;
    }
    const c: number[] = [];
    for (const p of this.targets) c.push(Math.round(p.x * 10), Math.round(p.z * 10));
    this.host.send({ a: 'build', o: this.mode === 'del' ? 'd' : this.mode === 'fix' ? 'f' : 'u', c });
    tap(this.mode === 'del' ? 'heavy' : 'medium');
  }

  /* ------------------------------ eventos ------------------------------ */
  onEvent(e: Ev, myId: string): void {
    const mine = e.p === myId;
    switch (e.k) {
      case 'bplace':
        if (mine && (e.n ?? 1) > 1) notify(t('nbuild.ev.placed', '{n} peças construídas!', { n: e.n ?? 1 }), { kind: 'good', iconHtml: bic(PIECE[e.i as PK]?.icon ?? 'build', 18) });
        break;
      case 'bdel':
        if (mine) speak(t('nbuild.say.del', 'Desmontado! Metade do material voltou para o acampamento.'), { cool: 8000 });
        break;
      case 'bfix':
        if (mine) speak(t('nbuild.say.fixed', 'Consertado!'), { cool: 3000 });
        break;
      case 'bup':
        if (mine) {
          speak(t('nbuild.say.upped', 'Ficou mais forte!'), { cool: 3000 });
          sfx.sparkle();
          success();
        }
        break;
      case 'bno':
        if (mine) speak(reasonText((e.i as Reason) || 'occ'), { cool: 1500, urgent: true });
        break;
      case 'bbreak': {
        const me = this.host.me();
        if (me && Math.hypot((e.x ?? 0) - me.x, (e.z ?? 0) - me.z) < 40) {
          notify(t('nbuild.ev.broke', 'Uma Sombrinha quebrou {x}!', { x: PIECE[e.i as PK]?.n() ?? '' }), { kind: 'warn', iconHtml: bic('demolish', 18) });
          speak(t('nbuild.say.broke', 'Quebraram uma parte da cerca! Conserte com o martelo.'), { cool: 20000 });
        }
        break;
      }
      case 'bhit': {
        const me = this.host.me();
        if (me && Math.hypot((e.x ?? 0) - me.x, (e.z ?? 0) - me.z) < 30) speak(t('nbuild.say.hit', 'As Sombrinhas estão batendo na cerca!'), { cool: 45000 });
        break;
      }
    }
  }

  dispose(): void {
    surfaceOf(this.host.wrap).remove(this.claim);
    this.offs.forEach((f) => f());
    this.ui.destroy();
  }
}
