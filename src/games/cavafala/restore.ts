/* ============================================================
 *  CAVA & FALA — MODO "RESTAURAR A VILA" (solo ou co-op com ajudantes).
 *  Desenterre e restaure os prédios antes do anoitecer. Quebra-cabeças:
 *  tocar o sino no alto da torre, esvaziar a praça alagada (bomba
 *  d'água), atravessar a ravina (ponte) e regar o jardim (regador).
 *  Tutorial guiado na 1ª vez: um objetivo por vez + seta.
 * ============================================================ */
import * as THREE from 'three';
import { sfx } from '../../3d/common/sfx';
import { t } from '../../i18n';
import { bigMoment, notify, objective } from '../../ui/notify';
import { BloopModel } from './bloop';
import { M, type Inv, type Theme } from './data';
import { GADGETS, costOf, gadgetById, noMods, type GDef, type Mods } from './gadgets';
import { rng } from './noise';
import { cavaSave, discover, persist } from './save';
import type { Building, Town, TownLayout } from './town';
import type { Actor, ModeCtl, Slot, Struct, World } from './world';

const DAY = 15 * 60;

interface Resident {
  m: BloopModel;
  x: number;
  z: number;
  y: number;
  tx: number;
  tz: number;
  wait: number;
  home: Building;
}
interface Helper {
  a: Actor;
  target: Building | null;
  pt: THREE.Vector3 | null;
  stuck: number;
  lastD: number;
  chat: number;
}
interface Pin {
  b: Building;
  sp: THREE.Sprite;
  tex: THREE.CanvasTexture;
  cv: HTMLCanvasElement;
  shown: number;
  y: number;
}
interface Tree {
  o: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  dead: boolean;
}

export interface RestoreResult {
  restored: number;
  total: number;
  stars: number;
  coins: number;
  time: number;
  win: boolean;
}

const V = new THREE.Vector3();

export class RestoreMode implements ModeCtl {
  time = 0;
  private residents: Resident[] = [];
  private helpers: Helper[] = [];
  private pins: Pin[] = [];
  private trees: Tree[] = [];
  private tut: number;
  private tutStart = new THREE.Vector3();
  private dug = 0;
  private tutHouse: Building | null = null;
  private coins = 0;
  private ended = false;
  private warned = false;
  private pinT = 0;
  private treeT = 0;
  private r = rng(99);
  private sea: THREE.Mesh | null = null;
  private clouds: THREE.Group = new THREE.Group();
  private clearQ: [number, number, number][] = [];
  /** de onde procurar o chão (abaixo do teto da caverna) */
  private get topY(): number {
    return this.th.cave ? 25 : 31;
  }

  constructor(
    private w: World,
    private town: Town,
    private th: Theme,
    private L: TownLayout,
    solo: boolean,
    private onEnd: (r: RestoreResult) => void,
  ) {
    this.tut = cavaSave().tut ? 99 : 0;
    this.tutStart.copy(w.me.body.p);
    // aparência
    if (th.sea) {
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#3aa8e8', transparent: true, opacity: 0.86, emissive: new THREE.Color('#0a3a6a') }));
      this.sea.rotation.x = -Math.PI / 2;
      this.sea.position.y = 7;
      w.scene.add(this.sea);
    }
    this.makeClouds();
    this.makeTrees();
    for (const b of town.list) this.makePin(b);
    if (!solo) {
      const hc = ['#ffb03a', '#5ad6a0'];
      for (let i = 0; i < 2; i++) {
        const at = w.me.body.p.clone().add(new THREE.Vector3(i ? 2 : -2, 0.5, 1.5));
        const a = w.addActor(t('cavafala.helper', 'Ajudante') + ' ' + (i + 1), hc[i], at, false, 'helmet');
        a.helper = true;
        a.ai = { speedK: 0.85 };
        this.helpers.push({ a, target: null, pt: null, stuck: 0, lastD: 0, chat: 4 + i * 3 });
      }
    }
    this.sky();
    w.me.yaw = 0;
    w.me.pitch = -0.25;
    if (this.tut === 0) setTimeout(() => this.tutStep(), 600);
    else objective(t('cavafala.obj.restore', 'Restaure a vila: {n}/{m}', { n: 0, m: town.list.length }));
  }

  /* ------------------------------ cenário ------------------------------ */
  private makeClouds(): void {
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#5a6a8a'), transparent: true, opacity: 0.92 });
    const g = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < (this.th.cave ? 0 : 14); i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(g, m);
        s.position.set(k * 2.2 - 3, Math.sin(k) * 0.6, (k % 2) * 1.2);
        s.scale.setScalar(2 + Math.random() * 1.6);
        c.add(s);
      }
      const a = (i / 14) * Math.PI * 2;
      const R = 70 + Math.random() * 40;
      c.position.set(Math.cos(a) * R, 30 + Math.random() * 18, Math.sin(a) * R);
      c.scale.y = 0.55;
      this.clouds.add(c);
    }
    this.w.scene.add(this.clouds);
  }

  private makeTrees(): void {
    const T = this.w.T;
    const leaf = this.th.id === 'neve' ? '#2f7a4a' : this.th.id === 'caverna' ? '#ff6aa8' : '#4fae5a';
    const trunkM = new THREE.MeshLambertMaterial({ color: '#8a5a3a' });
    const leafM = new THREE.MeshLambertMaterial({ color: leaf });
    const snowM = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    for (let i = 0; i < 16; i++) {
      const a = this.r() * Math.PI * 2;
      const R = 20 + this.r() * 9;
      const x = Math.cos(a) * R,
        z = Math.sin(a) * R + 4;
      if (Math.abs(z - this.L.ravZ) < 5) continue;
      if (Math.abs(x) > 30 || Math.abs(z) > 30) continue;
      const y = T.groundY(x, z, this.topY);
      if (y < 8) continue;
      const o = new THREE.Group();
      const tp = this.th.tree;
      if (tp === 'pine') {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), trunkM);
        tr.position.y = 0.5;
        o.add(tr);
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(1.3 - k * 0.3, 1.4, 8), leafM);
          c.position.y = 1.3 + k * 0.8;
          o.add(c);
          const s = new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.25, 0.5, 8), snowM);
          s.position.y = 1.75 + k * 0.8;
          o.add(s);
        }
      } else if (tp === 'palm') {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3, 6), trunkM);
        tr.position.y = 1.5;
        tr.rotation.z = 0.15;
        o.add(tr);
        for (let k = 0; k < 6; k++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), leafM);
          f.position.set(0.25 + Math.cos(k) * 0.7, 3, Math.sin(k) * 0.7);
          f.rotation.y = -k;
          f.rotation.z = -0.35;
          o.add(f);
        }
      } else if (tp === 'mushroom') {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8), new THREE.MeshLambertMaterial({ color: '#fff0e0' }));
        tr.position.y = 0.8;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: leaf, emissive: new THREE.Color(leaf).multiplyScalar(0.35) }));
        cap.position.y = 1.5;
        o.add(tr, cap);
      } else {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), trunkM);
        tr.position.y = 0.7;
        const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leafM);
        c.position.y = 2;
        o.add(tr, c);
      }
      o.position.set(x, y - 0.1, z);
      o.rotation.y = this.r() * 6;
      o.scale.setScalar(0.9 + this.r() * 0.5);
      this.w.scene.add(o);
      this.trees.push({ o, x, y, z, dead: false });
    }
  }

  private makePin(b: Building): void {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 160;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.3, 1.6, 1);
    sp.renderOrder = 15;
    this.w.scene.add(sp);
    const p: Pin = { b, sp, tex, cv, shown: -1, y: 0 };
    this.pins.push(p);
    this.drawPin(p);
  }
  private drawPin(p: Pin): void {
    const pct = Math.round(Math.min(1, p.b.uncovered / 0.78) * 100);
    if (pct === p.shown) return;
    p.shown = pct;
    const c = p.cv.getContext('2d')!;
    c.clearRect(0, 0, 128, 160);
    const col = p.b.puzzle && !p.b.puzzleDone && p.b.uncovered > 0.5 ? '#ff8a3a' : '#7b3cff';
    c.fillStyle = '#2a0b5c';
    c.beginPath();
    c.arc(64, 60, 52, 0, Math.PI * 2);
    c.moveTo(34, 100);
    c.lineTo(64, 152);
    c.lineTo(94, 100);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(64, 60, 45, 0, Math.PI * 2);
    c.fill();
    // anel de progresso
    c.strokeStyle = '#ffd34a';
    c.lineWidth = 9;
    c.beginPath();
    c.arc(64, 60, 45, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = '800 34px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(p.b.puzzle && !p.b.puzzleDone && p.b.uncovered > 0.5 ? '!' : pct + '%', 64, 62);
    p.tex.needsUpdate = true;
  }

  private sky(): void {
    const k = Math.min(1, this.time / DAY);
    // dia claro até 70%, depois pôr do sol e noite
    const dusk = Math.max(0, (k - 0.7) / 0.3);
    const C1 = new THREE.Color(this.th.sky[0]).lerp(new THREE.Color(this.th.night[0]), dusk);
    const C2 = new THREE.Color(this.th.sky[1]).lerp(new THREE.Color(this.th.night[1]), dusk);
    const fog = new THREE.Color(this.th.fog).lerp(new THREE.Color(this.th.night[1]), dusk);
    const light = this.th.cave ? 0.68 - dusk * 0.2 : 1 - dusk * 0.6;
    this.w.setSky('#' + C1.getHexString(), '#' + C2.getHexString(), light, '#' + fog.getHexString());
    this.w.dayK = k;
  }

  /* ------------------------------ ModeCtl ------------------------------ */
  status(): string {
    const left = Math.max(0, DAY - this.time);
    const mm = Math.floor(left / 60),
      ss = Math.floor(left % 60);
    const sun = this.w.dayK > 0.7 ? '🌙' : '☀️';
    return `<span class="cf-chip">${this.town.restoredCount}/${this.town.list.length} ${t('cavafala.restored', 'restaurados')}</span><span class="cf-chip${left < 90 ? ' warn' : ''}">${sun} ${mm}:${String(ss).padStart(2, '0')}</span>`;
  }

  update(dt: number): void {
    if (this.ended) return;
    this.time += dt;
    this.sky();
    this.clouds.rotation.y += dt * 0.004;
    // restaurações e quebra-cabeças
    for (const b of this.town.list) {
      if (b.restored) continue;
      this.checkPuzzle(b);
      if (b.puzzle && !b.puzzleDone && !b.puzzleHint && b.uncovered > 0.55) {
        b.puzzleHint = true;
        this.hint(b);
      }
      if (b.uncovered >= 0.78 && b.puzzleDone) this.restore(b);
    }
    if (this.clearQ.length) {
      const got: Inv = {};
      for (let k = 0; k < 10 && this.clearQ.length; k++) {
        const [x, y, z] = this.clearQ.shift()!;
        const n = this.w.T.dig(x, y, z, 1.9, got, 3);
        if (n > 0 && Math.random() < 0.35) this.w.fx.dust(x, y, z, '#fff4d8', 3);
      }
      for (const [k, v] of Object.entries(got)) this.w.me.inv[+k] = (this.w.me.inv[+k] ?? 0) + v! * 0.3;
    }
    this.updatePins(dt);
    this.updateHelpers(dt);
    this.updateResidents(dt);
    this.updateTrees(dt);
    if (this.tut < 99) this.tutCheck();
    if (!this.warned && DAY - this.time < 90) {
      this.warned = true;
      notify(t('cavafala.dusk', 'Está anoitecendo! Corra para restaurar o que falta.'), { kind: 'warn' });
    }
    if (this.time >= DAY) this.finish(false);
  }

  private hint(b: Building): void {
    const msg =
      b.puzzle === 'bell'
        ? t('cavafala.hint.bell', '{b}: toque o sino lá no alto! Diga “escada”, “trampolim” ou “jetpack”.', { b: b.name })
        : b.puzzle === 'drain'
          ? t('cavafala.hint.drain', '{b}: a praça está alagada! Diga “bomba d’água” perto da fonte.', { b: b.name })
          : b.puzzle === 'bridge'
            ? t('cavafala.hint.bridge', '{b}: falta o meio! Diga “ponte” bem na beirada.', { b: b.name })
            : t('cavafala.hint.water', '{b}: as flores estão secas. Diga “regador” e regue o jardim.', { b: b.name });
    notify(msg, { kind: 'info', ms: 4500 });
    sfx.sparkle();
    // garante a receita no círculo
    const id = b.puzzle === 'drain' ? 'bomba' : b.puzzle === 'water' ? 'regador' : b.puzzle === 'bridge' ? 'ponte' : 'escada';
    discover(id);
  }

  private checkPuzzle(b: Building): void {
    if (b.puzzleDone) return;
    if (b.puzzle === 'bell') {
      for (const a of this.w.actors)
        if (a.isPlayer && a.body.p.distanceTo(V.copy(b.top).setY(b.top.y - 1)) < 2.8) {
          b.puzzleDone = true;
          this.bell(b);
        }
    } else if (b.puzzle === 'drain' && b.uncovered > 0.3) {
      if (this.w.structs.some((s) => s.g.beh === 'pump' && Math.hypot(s.pos.x - b.x, s.pos.z - b.z) < 11)) {
        b.puzzleDone = true;
        notify(t('cavafala.drained', 'Glub glub... a bomba está esvaziando a praça!'), { kind: 'good' });
        sfx.spray();
      }
    } else if (b.puzzle === 'bridge') {
      if (this.w.structs.some((s) => s.g.beh === 'bridge' && Math.hypot(s.pos.x - b.x, s.pos.z - b.z) < 8 && Math.abs(s.pos.y - b.y) < 3)) {
        b.puzzleDone = true;
        notify(t('cavafala.bridged', 'A ponte nova encaixou na velha!'), { kind: 'good' });
      }
    }
  }

  private bell(b: Building): void {
    bigMoment(t('cavafala.bell', 'Blém, blém!'), { sub: b.name });
    sfx.sparkle();
    sfx.swish();
    this.w.fx.sparkle(b.top.x, b.top.y, b.top.z, 30);
  }

  onUse(_a: Actor, s: Slot, at: THREE.Vector3 | null): void {
    if (s.g.beh === 'watering' && at) {
      for (const b of this.town.list)
        if (b.puzzle === 'water' && !b.puzzleDone && Math.hypot(at.x - b.x, at.z - b.z) < 6 && b.uncovered > 0.3) {
          b.puzzleDone = true;
          notify(t('cavafala.watered', 'As flores beberam água! Que cheirinho!'), { kind: 'good' });
          sfx.sparkle();
        }
    }
  }

  onDig(a: Actor, got: Inv): void {
    if (a.isPlayer) for (const v of Object.values(got)) this.dug += v ?? 0;
  }

  onCreate(a: Actor, g: GDef, mods: Mods, st: Struct | null): void {
    void mods;
    void st;
    if (a.isPlayer && this.tut === 4) this.tutNext();
    if (a.isPlayer && g.beh === 'bridge') this.w.tipOnce('bridgeTip', t('cavafala.tip.bridge', 'Dica: “ponte dupla” faz uma ponte bem comprida!'));
  }

  onOut(a: Actor): void {
    // caiu fora do mapa (não deveria): volta ao alto
    a.body.p.copy(this.L.spawn);
    a.body.v.set(0, 0, 0);
  }

  respawn(): void {
    const a = this.w.me;
    a.body.p.copy(this.L.spawn);
    a.body.p.y = this.w.T.groundY(a.body.p.x, a.body.p.z, this.topY) + 0.2;
    a.body.v.set(0, 0, 0);
  }

  aimInfo(hit: THREE.Vector3 | null): { name: string; v: number } | null {
    if (!hit) return null;
    let best: Building | null = null;
    let bd = 7;
    for (const b of this.town.list) {
      if (b.restored) continue;
      const d = Math.hypot(hit.x - b.x, hit.z - b.z) - b.rad * 0.6;
      if (d < bd && hit.y > b.y - 2) {
        bd = d;
        best = b;
      }
    }
    if (!best) return null;
    return { name: best.name, v: Math.min(1, best.uncovered / 0.78) };
  }

  tutorialTarget(): THREE.Vector3 | null {
    if (this.tut === 2 || this.tut === 3) {
      const b = this.tutHouse;
      if (!b || b.restored) return null;
      return V.set(b.x, this.pinY(b) - 0.6, b.z);
    }
    return null;
  }

  /* ------------------------------ restauração ------------------------------ */
  restore(b: Building): void {
    if (b.restored) return;
    this.town.restore(b);
    this.w.refreshBoxes();
    // tira a terra que sobrou dentro/colada no prédio (vira bônus)
    const bonus: Inv = {};
    const bb = b.aabb;
    for (let x = bb.min.x; x <= bb.max.x; x += 1.5)
      for (let z = bb.min.z; z <= bb.max.z; z += 1.5)
        for (let y = b.y + 1.35; y <= bb.max.y + 0.4; y += 1.5) this.w.T.dig(x, y, z, 1.25, bonus, 3);
    // abre uma "bacia" em volta (terra some de cima para baixo, aos poucos)
    if (b.kind !== 'bridge') {
      const ops: [number, number, number][] = [];
      const E = 3.2;
      for (let x = bb.min.x - E; x <= bb.max.x + E; x += 1.8)
        for (let z = bb.min.z - E; z <= bb.max.z + E; z += 1.8) {
          const out = Math.max(bb.min.x - x, x - bb.max.x, bb.min.z - z, z - bb.max.z, 0);
          const top = this.w.T.groundY(x, z, this.topY, b.y);
          if (top === -Infinity) continue;
          for (let y = top + 0.4; y >= b.y + 2 + out * 0.9; y -= 1.6) ops.push([x, y, z]);
        }
      ops.sort((a, c) => c[1] - a[1]);
      this.clearQ.push(...ops);
    }
    let tot = 0;
    for (const [k, v] of Object.entries(bonus)) {
      const g = Math.round(v! * 0.5);
      this.w.me.inv[+k] = (this.w.me.inv[+k] ?? 0) + g;
      tot += g;
    }
    // efeitos
    const c = b.top;
    this.w.fx.confetti(b.x, b.y + 3, b.z, 60);
    this.w.fx.sparkle(c.x, c.y, c.z, 30);
    this.w.fx.dust(b.x, b.y + 1, b.z, '#ffffff', 20);
    if (this.w.isNear(b.x, b.y, b.z)) this.w.fx.addShake(0.15);
    sfx.clean();
    setTimeout(() => sfx.sparkle(), 250);
    this.coins += 12;
    const n = this.town.restoredCount;
    bigMoment(t('cavafala.restoredBig', '{b} restaurado!', { b: b.name }), { sub: `${n}/${this.town.list.length}` });
    // recompensa: receita nova
    const nxt = this.nextRecipe();
    if (nxt) {
      discover(nxt.id);
      setTimeout(() => notify(t('cavafala.reward', 'Os moradores te ensinaram: {g}! (+{n} materiais)', { g: nxt.name(), n: tot }), { kind: 'good', ms: 4000 }), 900);
    } else if (tot) notify(t('cavafala.bonus', '+{n} materiais de bônus', { n: tot }), { kind: 'good' });
    // moradores saem comemorando
    const cols = ['#ff8fd8', '#7ab8ff', '#ffd34a', '#5ad6a0', '#ff8a3a', '#b08aff'];
    const hats = ['straw', 'cap', 'beanie', 'bow', '', 'crown'] as const;
    const k = b.kind === 'house' ? 3 : 2;
    for (let i = 0; i < k && this.residents.length < 18; i++) {
      const m = new BloopModel(cols[(b.i + i) % cols.length], 0.85, this.th.snow ? 'beanie' : hats[(b.i * 3 + i) % hats.length], cols[(b.i + i + 2) % cols.length]);
      const x = b.door.x + (i - 1) * 0.8,
        z = b.door.z;
      m.root.position.set(x, b.y, z);
      m.cheer = 1;
      this.w.scene.add(m.root);
      if (i === 0) m.say([t('cavafala.res.thanks', 'Obrigado!'), t('cavafala.res.yay', 'Ebaaa!'), t('cavafala.res.home', 'Minha casa!')][b.i % 3], 2600);
      this.residents.push({ m, x, z, y: b.y, tx: x, tz: z, wait: 2.5 + i * 0.4, home: b });
    }
    objective(t('cavafala.obj.restore', 'Restaure a vila: {n}/{m}', { n, m: this.town.list.length }));
    if (this.tut === 3) this.tutNext();
    if (n >= this.town.list.length) setTimeout(() => this.finish(true), 2500);
  }

  private nextRecipe(): GDef | null {
    const s = cavaSave();
    // primeiro o que ajuda nos quebra-cabeças que faltam
    const need = this.town.list.filter((b) => !b.restored && b.puzzle).map((b) => (b.puzzle === 'drain' ? 'bomba' : b.puzzle === 'water' ? 'regador' : b.puzzle === 'bell' ? 'jetpack' : 'ponte'));
    for (const id of need) if (!s.found.includes(id)) return gadgetById(id) ?? null;
    const rest = GADGETS.filter((g) => !s.found.includes(g.id));
    return rest.length ? rest[Math.floor(this.r() * rest.length)] : null;
  }

  private pinY(b: Building): number {
    const T = this.w.T;
    const gy = T.groundY(b.x, b.z, this.topY, b.y - 2);
    return Math.max(b.top.y + 1.2, gy + 1.8);
  }
  private updatePins(dt: number): void {
    this.pinT -= dt;
    const refresh = this.pinT <= 0;
    if (refresh) this.pinT = 0.6;
    for (const p of this.pins) {
      if (p.b.restored) {
        if (p.sp.visible) {
          p.sp.scale.multiplyScalar(0.9);
          if (p.sp.scale.x < 0.1) p.sp.visible = false;
        }
        continue;
      }
      if (refresh) {
        p.y = this.pinY(p.b);
        this.drawPin(p);
      }
      p.sp.position.set(p.b.x, p.y + Math.sin(this.time * 2 + p.b.i) * 0.15, p.b.z);
      // longe = maior (sempre legível)
      const d = this.w.cam.position.distanceTo(p.sp.position);
      const s = Math.max(0.8, d / 18);
      p.sp.scale.set(1.1 * s, 1.35 * s, 1);
      p.sp.material.opacity = d < 4 ? Math.max(0.15, d / 4) : 1;
    }
  }

  /* ------------------------------ ajudantes ------------------------------ */
  private updateHelpers(dt: number): void {
    const T = this.w.T;
    for (const h of this.helpers) {
      const a = h.a;
      h.chat -= dt;
      if (!h.target || h.target.restored || !h.pt || T.sample(h.pt.x, h.pt.y, h.pt.z) <= 0) {
        // alvo: prédio mais perto do jogador ainda enterrado
        let best: Building | null = null;
        let bd = Infinity;
        for (const b of this.town.list) {
          if (b.restored || b.kind === 'bridge') continue;
          const d = Math.hypot(b.x - this.w.me.body.p.x, b.z - this.w.me.body.p.z) + (b === this.tutHouse ? -20 : 0);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        h.target = best;
        h.pt = null;
        if (best) {
          const s = best.samples;
          const N = s.length / 3;
          for (let k = 0; k < 12; k++) {
            const i = Math.floor(Math.random() * N) * 3;
            if (T.sample(s[i], s[i + 1], s[i + 2]) > 0) {
              h.pt = new THREE.Vector3(s[i], s[i + 1], s[i + 2]);
              break;
            }
          }
        }
      }
      a.move.set(0, 0, 0);
      if (!h.pt) continue;
      const dx = h.pt.x - a.body.p.x,
        dz = h.pt.z - a.body.p.z;
      const dh = Math.hypot(dx, dz);
      a.yaw = Math.atan2(-dx, -dz);
      if (dh > 2.6) {
        a.move.set(dx / dh, 0, dz / dh);
        // pula degraus
        if (a.body.onGround && T.sample(a.body.p.x + (dx / dh) * 0.7, a.body.p.y + 0.5, a.body.p.z + (dz / dh) * 0.7) > 0) a.wantJump = true;
        h.stuck = Math.abs(h.lastD - dh) < 0.02 ? h.stuck + dt : Math.max(0, h.stuck - dt);
        h.lastD = dh;
      }
      // cava em direção ao ponto
      a.digCd -= dt;
      if (a.digCd <= 0 && dh < 5) {
        a.digCd = 0.5;
        const eye = V.copy(a.body.p).setY(a.body.p.y + 1.3);
        const dir = h.pt.clone().sub(eye).normalize();
        const before = { ...a.inv };
        this.w.digFrom(a, eye, dir, { R: 1.05, power: 1.2, reach: 6 });
        // metade do que o ajudante cava vai para você
        for (const [k, v] of Object.entries(a.inv)) {
          const g = (v ?? 0) - (before[+k] ?? 0);
          if (g > 0) this.w.me.inv[+k] = (this.w.me.inv[+k] ?? 0) + g * 0.5;
          a.inv[+k] = 0;
        }
      }
      if (h.stuck > 5 || a.body.p.y < 1) {
        h.stuck = 0;
        this.w.fx.dust(a.body.p.x, a.body.p.y + 0.5, a.body.p.z, '#ffffff', 8);
        a.body.p.copy(this.w.me.body.p).add(new THREE.Vector3(1.5, 0.6, 1.5));
        a.body.v.set(0, 0, 0);
        h.pt = null;
      }
      if (h.chat <= 0) {
        h.chat = 9 + Math.random() * 8;
        a.model?.say([t('cavafala.help.1', 'Cava, cava!'), t('cavafala.help.2', 'Achei uma janela!'), t('cavafala.help.3', 'Por aqui!'), t('cavafala.help.4', 'Que terra fofinha!')][Math.floor(Math.random() * 4)]);
      }
    }
  }

  /* ------------------------------ moradores ------------------------------ */
  private updateResidents(dt: number): void {
    const T = this.w.T;
    for (const r of this.residents) {
      r.wait -= dt;
      if (r.m.cheer > 0) r.m.cheer = Math.max(0, r.m.cheer - dt * 0.25);
      let sp = 0;
      if (r.wait <= 0) {
        const dx = r.tx - r.x,
          dz = r.tz - r.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          r.wait = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          const R = 3 + Math.random() * 9;
          r.tx = this.L.cx + Math.cos(a) * R;
          r.tz = this.L.cz + Math.sin(a) * R;
          if (Math.random() < 0.3) r.m.cheer = 0.6;
        } else {
          const nx = r.x + (dx / d) * 1.6 * dt,
            nz = r.z + (dz / d) * 1.6 * dt;
          const gy = T.groundY(nx, nz, r.y + 1.2, r.y - 2);
          // não sobe em terra alta nem cai em buraco: escolhe outro destino
          if (gy === -Infinity || gy > r.y + 0.7 || gy < r.y - 1.5 || this.w.phys.boxes.some((b) => Math.abs(nx - b.x) < b.hx + 0.3 && Math.abs(nz - b.z) < b.hz + 0.3 && b.y + b.hy > r.y + 0.5 && Math.hypot(b.x - nx, b.z - nz) < b.r)) {
            r.tx = r.home.door.x;
            r.tz = r.home.door.z;
            r.wait = 1;
          } else {
            r.x = nx;
            r.z = nz;
            r.y += (gy - r.y) * Math.min(1, dt * 8);
            sp = 1.6;
            r.m.root.rotation.y = Math.atan2(-dx, -dz);
          }
        }
      }
      r.m.root.position.set(r.x, r.y, r.z);
      r.m.update(dt, sp, false);
    }
  }

  private updateTrees(dt: number): void {
    this.treeT -= dt;
    if (this.treeT > 0) return;
    this.treeT = 0.5;
    for (const tr of this.trees) {
      if (tr.dead) continue;
      if (this.w.T.sample(tr.x, tr.y - 0.35, tr.z) <= 0) {
        tr.dead = true;
        this.w.scene.remove(tr.o);
        this.w.fx.dust(tr.x, tr.y + 1, tr.z, '#9ad87a', 14);
        this.w.fx.chunks(tr.x, tr.y + 1.5, tr.z, 0, 1, 0, '#4fae5a', 8, 4);
        if (this.w.isNear(tr.x, tr.y, tr.z)) {
          sfx.poof();
          this.w.me.inv[M.Grama] = (this.w.me.inv[M.Grama] ?? 0) + 6;
          this.w.hud.gain('+6 ' + t('cavafala.mat.grama', 'grama'), '#9ad87a');
        }
      }
    }
  }

  /* ------------------------------ tutorial ------------------------------ */
  private tutStep(): void {
    const steps = [
      t('cavafala.tut.0', 'Arraste a tela para olhar e use o joystick para andar.'),
      t('cavafala.tut.1', 'Segure CAVAR (ou Q) mirando no chão para cavar terra.'),
      t('cavafala.tut.2', 'Tem uma casa enterrada ali! Siga a seta e cave em cima dela.'),
      t('cavafala.tut.3', 'Continue cavando em volta das paredes até restaurar a casa!'),
      t('cavafala.tut.4', 'Segure FALAR e diga “trampolim” (ou toque no teclado e digite).'),
    ];
    if (this.tut >= steps.length) {
      cavaSave().tut = true;
      persist();
      this.tut = 99;
      bigMoment(t('cavafala.tut.done', 'Você pegou o jeito!'), { sub: t('cavafala.tut.doneSub', 'Restaure a vila antes do anoitecer') });
      objective(t('cavafala.obj.restore', 'Restaure a vila: {n}/{m}', { n: this.town.restoredCount, m: this.town.list.length }));
      return;
    }
    if (this.tut === 2) {
      // a casa mais perto do começo
      let best: Building | null = null;
      let bd = Infinity;
      for (const b of this.town.list) {
        if (b.kind !== 'house' && b.kind !== 'statue' && b.kind !== 'well') continue;
        const d = b.door.distanceTo(this.L.spawn);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      this.tutHouse = best;
    }
    if (this.tut === 4) {
      // garante material para o 1º trampolim
      const c = costOf(gadgetById('trampolim')!, noMods());
      let gift = false;
      for (const [k, v] of Object.entries(c))
        if ((this.w.me.inv[+k] ?? 0) < v) {
          this.w.me.inv[+k] = v + 4;
          gift = true;
        }
      if (gift) notify(t('cavafala.gift', 'Os moradores te deram materiais de presente!'), { kind: 'good' });
    }
    const short = [
      t('cavafala.tuto.0', 'Ande e olhe em volta'),
      t('cavafala.tuto.1', 'Cave terra (CAVAR)'),
      t('cavafala.tuto.2', 'Siga a seta: casa enterrada'),
      t('cavafala.tuto.3', 'Desenterre a casa toda'),
      t('cavafala.tuto.4', 'Segure FALAR: “trampolim”'),
    ];
    objective(short[this.tut]);
    notify(steps[this.tut], { ms: 4200, key: 'tut' });
  }
  private tutNext(): void {
    this.tut++;
    sfx.catch();
    setTimeout(() => this.tutStep(), 500);
  }
  private tutCheck(): void {
    const me = this.w.me;
    if (this.tut === 0 && Math.hypot(me.body.p.x - this.tutStart.x, me.body.p.z - this.tutStart.z) > 3.5) this.tutNext();
    else if (this.tut === 1 && this.dug >= 30) this.tutNext();
    else if (this.tut === 2 && this.tutHouse && this.tutHouse.uncovered > 0.3) this.tutNext();
  }

  /* ------------------------------ fim ------------------------------ */
  finish(win: boolean): void {
    if (this.ended) return;
    this.ended = true;
    const n = this.town.restoredCount;
    const total = this.town.list.length;
    const stars = n >= total ? 3 : n >= Math.ceil(total * 0.7) ? 2 : n >= Math.ceil(total * 0.4) ? 1 : 0;
    const coins = this.coins + stars * 20;
    objective(null);
    this.onEnd({ restored: n, total, stars, coins, time: this.time, win });
  }

  dispose(): void {
    objective(null);
    for (const r of this.residents) r.m.dispose();
    for (const p of this.pins) {
      p.tex.dispose();
      p.sp.material.dispose();
    }
    if (this.sea) {
      this.sea.geometry.dispose();
      (this.sea.material as THREE.Material).dispose();
    }
  }
}
