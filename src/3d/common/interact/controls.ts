/* ============================================================
 *  CONTROLES FÍSICOS no mundo (kit de interação 3D): botão giratório,
 *  botão de apertar, alavanca, porta com dobradiça, tampa.
 *  Cada um é um THREE.Group com AABB de mira (`box`), estado `on`,
 *  animação de mola com um "quique" (suco) e `press()` para o toque.
 *  Coordenadas locais: +Z aponta PARA O JOGADOR (frente do móvel).
 * ============================================================ */
import * as THREE from 'three';

/** mola sub-amortecida (passa um pouco do ponto: dá vida) */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    public k = 260,
    public damp = 16,
  ) {}
  step(target: number, dt: number): number {
    const h = Math.min(dt, 1 / 30);
    this.v += ((target - this.x) * this.k - this.v * this.damp) * h;
    this.x += this.v * h;
    return this.x;
  }
  get moving(): boolean {
    return Math.abs(this.v) > 0.002;
  }
}

export interface ControlOpts {
  x: number;
  y: number;
  z: number;
  /** giro (rad) em Y: a frente local (+Z) passa a apontar para (sin yaw, cos yaw) */
  yaw: number;
  scale?: number;
  /** texto curto do alvo (rótulo da mira) */
  label: () => string;
  /** verbo do botão da mão (recebe o estado atual) */
  verb: (on: boolean) => string;
  /** cor principal */
  color?: string;
}

/** materiais compartilhados (um kit por cena) */
export class ControlKit {
  private mats = new Map<string, THREE.Material>();
  private geos: THREE.BufferGeometry[] = [];
  readonly controls: Control[] = [];
  constructor(readonly standard: boolean) {}
  mat(hex: string, metal = 0, emissive = false): THREE.Material {
    const key = hex + metal + emissive;
    let m = this.mats.get(key);
    if (!m) {
      if (emissive) m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
      else if (this.standard) m = new THREE.MeshStandardMaterial({ color: hex, roughness: metal ? 0.3 : 0.5, metalness: metal });
      else m = new THREE.MeshLambertMaterial({ color: hex });
      this.mats.set(key, m);
    }
    return m;
  }
  geo<G extends THREE.BufferGeometry>(g: G): G {
    this.geos.push(g);
    return g;
  }
  mesh(g: THREE.BufferGeometry, hex: string, metal = 0, emissive = false): THREE.Mesh {
    const m = new THREE.Mesh(this.geo(g), this.mat(hex, metal, emissive));
    m.castShadow = !emissive && this.standard;
    return m;
  }
  /** registra (e calcula a caixa de mira — posicione o grupo antes; o pai deve estar na origem) */
  add<C extends Control>(c: C): C {
    this.controls.push(c);
    c.refreshBox();
    return c;
  }
  update(dt: number, time: number): void {
    for (const c of this.controls) c.update(dt, time);
  }
  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const c of this.controls) c.group.parent?.remove(c.group);
    this.controls.length = 0;
  }
}

export abstract class Control {
  readonly group = new THREE.Group();
  /** AABB no mundo (mira); recalculada quando a peça se mexe */
  readonly box = new THREE.Box3();
  on = false;
  /** chamado quando o JOGADOR (ou o jogo) muda o estado */
  onChange?: (on: boolean, c: Control) => void;
  /** brilho de "olha aqui" 0..1 (dica por hesitação) */
  hint = 0;
  readonly label: () => string;
  readonly verb: (on: boolean) => string;
  protected spring = new Spring();
  /** margem extra da caixa de mira (dedo gordo) */
  protected pad = 0.04;
  private glowM: THREE.Mesh | null = null;
  constructor(
    protected kit: ControlKit,
    o: ControlOpts,
  ) {
    this.label = o.label;
    this.verb = o.verb;
    this.group.position.set(o.x, o.y, o.z);
    this.group.rotation.y = o.yaw;
    this.group.scale.setScalar(o.scale ?? 1);
  }
  /** chame depois de montar e adicionar à cena */
  refreshBox(): void {
    this.group.updateMatrixWorld(true);
    this.box.setFromObject(this.group);
    this.box.expandByScalar(this.pad);
  }
  /** toque do jogador: alterna (subclasses podem mudar) */
  press(): void {
    this.set(!this.on);
  }
  set(on: boolean, silent = false): void {
    if (on === this.on) return;
    this.on = on;
    if (!silent) this.onChange?.(on, this);
  }
  /** pose animada (0 desligado … 1 ligado) */
  protected abstract pose(k: number): void;
  protected target(): number {
    return this.on ? 1 : 0;
  }
  /** aro de brilho de dica (filho do grupo) */
  protected glow(g: THREE.BufferGeometry, y = 0, z = 0): void {
    const m = new THREE.Mesh(this.kit.geo(g), new THREE.MeshBasicMaterial({ color: '#3effa0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.position.set(0, y, z);
    m.renderOrder = 5;
    m.visible = false;
    this.group.add(m);
    this.glowM = m;
  }
  update(dt: number, time: number): void {
    const was = this.spring.moving || Math.abs(this.spring.x - this.target()) > 0.001;
    const k = this.spring.step(this.target(), dt);
    if (was) {
      this.pose(k);
      this.refreshBox();
    }
    const gm = this.glowM;
    if (gm) {
      gm.visible = this.hint > 0.01;
      if (gm.visible) {
        (gm.material as THREE.MeshBasicMaterial).opacity = this.hint * (0.45 + Math.sin(time * 7) * 0.3);
        gm.scale.setScalar(1 + Math.sin(time * 7) * 0.08);
      }
    }
  }
}

/** botão giratório (fogão/forno): gira ~120° quando liga; ponteiro + luz */
export class Knob extends Control {
  private dial: THREE.Group;
  private led: THREE.Mesh;
  constructor(kit: ControlKit, o: ControlOpts) {
    super(kit, o);
    const base = kit.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20).rotateX(Math.PI / 2), '#d6dae2', 0.8);
    base.position.z = 0.006;
    this.dial = new THREE.Group();
    const body = kit.mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.045, 18).rotateX(Math.PI / 2), o.color ?? '#2a2733');
    body.position.z = 0.03;
    const fin = kit.mesh(new THREE.BoxGeometry(0.018, 0.075, 0.03), o.color ?? '#2a2733');
    fin.position.z = 0.055;
    const mark = kit.mesh(new THREE.BoxGeometry(0.012, 0.026, 0.006), '#ff5c7a', 0, true);
    mark.position.set(0, 0.026, 0.071);
    this.dial.add(body, fin, mark);
    this.led = kit.mesh(new THREE.SphereGeometry(0.011, 8, 6), '#4a4458');
    this.led.position.set(0.075, 0.045, 0.012);
    this.group.add(base, this.dial, this.led);
    this.glow(new THREE.RingGeometry(0.07, 0.095, 24), 0, 0.02);
  }
  protected pose(k: number): void {
    this.dial.rotation.z = -k * 2.1;
    this.led.material = this.kit.mat(k > 0.5 ? '#ff7a2e' : '#4a4458', 0, k > 0.5);
  }
}

/** botão de apertar: momentâneo (afunda e volta) ou liga/desliga (fica aceso) */
export class PushButton extends Control {
  private cap: THREE.Mesh;
  private flash = 0;
  /** cor própria (sininho dourado): antes virava vermelho depois do 1º toque e parecia "quebrado" */
  private col: string;
  constructor(
    kit: ControlKit,
    o: ControlOpts,
    readonly toggle = true,
  ) {
    super(kit, o);
    this.col = o.color ?? '#ff3e5e';
    const ring = kit.mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.016, 20).rotateX(Math.PI / 2), '#2a2238');
    ring.position.z = 0.008;
    this.cap = kit.mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.03, 18).rotateX(Math.PI / 2), o.color ?? '#ff3e5e');
    this.cap.position.z = 0.022;
    this.group.add(ring, this.cap);
    this.glow(new THREE.RingGeometry(0.06, 0.085, 24), 0, 0.02);
  }
  override press(): void {
    this.flash = 1;
    if (this.toggle) super.press();
    else this.onChange?.(true, this);
  }
  protected override target(): number {
    return this.flash > 0.5 ? 1 : this.on ? 0.5 : 0;
  }
  override update(dt: number, time: number): void {
    const fl = this.flash > 0;
    if (fl) {
      this.flash = Math.max(0, this.flash - dt * 6);
      this.spring.v += 0.0001; // força recalcular a pose
    }
    super.update(dt, time);
    if (fl && this.flash === 0) this.pose(this.spring.x); // apaga a luz do toque
  }
  protected pose(k: number): void {
    this.cap.position.z = 0.022 - Math.max(0, Math.min(1, k)) * 0.014;
    // momentâneo: acende só durante o toque; liga/desliga: aceso enquanto ligado
    const lit = this.toggle ? this.on : this.flash > 0.05;
    this.cap.material = this.kit.mat(lit ? '#ffe14a' : this.col, 0, lit);
  }
}

/** alavanca (torneira, torradeira): braço que gira em X (para cima → para frente/baixo) */
export class Lever extends Control {
  private arm: THREE.Group;
  constructor(
    kit: ControlKit,
    o: ControlOpts,
    readonly len = 0.12,
    readonly from = -0.4,
    readonly to = 1.1,
  ) {
    super(kit, o);
    const hub = kit.mesh(new THREE.SphereGeometry(0.022, 12, 8), '#d6dae2', 0.8);
    this.arm = new THREE.Group();
    const rod = kit.mesh(new THREE.CylinderGeometry(0.009, 0.011, len, 8), '#d6dae2', 0.8);
    rod.position.y = len / 2;
    const ball = kit.mesh(new THREE.SphereGeometry(0.022, 12, 8), o.color ?? '#5aaaff');
    ball.position.y = len;
    this.arm.add(rod, ball);
    this.group.add(hub, this.arm);
    this.glow(new THREE.SphereGeometry(len * 0.75, 12, 8), len * 0.5, 0);
    this.pose(0);
  }
  protected pose(k: number): void {
    this.arm.rotation.x = this.from + (this.to - this.from) * k;
  }
}

/** porta com dobradiça na lateral (geladeira, armário, forno de lado). Fecha sozinha depois de `autoClose` s */
export class HingedDoor extends Control {
  readonly door = new THREE.Group();
  private idle = 0;
  /** filho da porta para adesivos/ícones (lado de fora) */
  readonly face = new THREE.Group();
  constructor(
    kit: ControlKit,
    o: ControlOpts,
    readonly w: number,
    readonly h: number,
    readonly side: 1 | -1 = -1,
    readonly autoClose = 5,
    readonly openAngle = 1.9,
  ) {
    super(kit, o);
    this.pad = 0.02;
    const d = 0.04;
    const panel = kit.mesh(new THREE.BoxGeometry(w, h, d), o.color ?? '#f4f7fb', 0.1);
    panel.position.set(-side * w / 2, h / 2, d / 2);
    const handle = kit.mesh(new THREE.CylinderGeometry(0.014, 0.014, h * 0.45, 8), '#cfd3dc', 0.8);
    handle.position.set(-side * (w - 0.07), h * 0.55, d + 0.03);
    const tabA = kit.mesh(new THREE.BoxGeometry(0.02, 0.02, 0.035), '#cfd3dc', 0.8);
    tabA.position.set(-side * (w - 0.07), h * 0.55 + h * 0.2, d + 0.015);
    const tabB = tabA.clone();
    tabB.position.y = h * 0.55 - h * 0.2;
    this.face.position.set(-side * w / 2, h / 2, d + 0.002);
    this.door.add(panel, handle, tabA, tabB, this.face);
    this.door.position.x = side * w / 2;
    this.group.add(this.door);
    this.glow(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.01), h / 2, d + 0.01);
  }
  /** mantém aberta (alguém está mexendo lá dentro) */
  touch(): void {
    this.idle = 0;
  }
  override set(on: boolean, silent = false): void {
    this.idle = 0;
    super.set(on, silent);
  }
  override update(dt: number, time: number): void {
    if (this.on && this.autoClose > 0) {
      this.idle += dt;
      if (this.idle > this.autoClose) this.set(false);
    }
    super.update(dt, time);
  }
  protected pose(k: number): void {
    // abre PARA FORA (na direção de quem olha, +z local) girando na dobradiça
    this.door.rotation.y = this.side * k * this.openAngle;
  }
}

/** tampa com dobradiça atrás (lixeira, panela): abre para cima */
export class Lid extends Control {
  readonly lid = new THREE.Group();
  constructor(
    kit: ControlKit,
    o: ControlOpts,
    geo: THREE.BufferGeometry,
    readonly depth: number,
  ) {
    super(kit, o);
    const m = kit.mesh(geo, o.color ?? '#2f9e54');
    m.position.z = depth / 2;
    this.lid.add(m);
    this.lid.position.z = -depth / 2;
    this.group.add(this.lid);
  }
  protected pose(k: number): void {
    this.lid.rotation.x = -k * 1.5;
  }
}
