/* ============================================================
 *  A MÃO 2D NO 3D — desenhada em canvas com as cores do personagem
 *  (skin light/dark/belly ou avatar customizado) e mostrada num plano
 *  preso à câmera. Balanço ao andar, atraso ao olhar e animações de
 *  pegar / jogar / esfregar / pintar / comer / chutar / picar.
 *  Compartilhada pela casa 3D (src/home3d) e pela cozinha em 1ª pessoa.
 * ============================================================ */
import * as THREE from 'three';
import { skinById } from '../../game/skins';
import { save } from '../../core/storage';
import { canvas, shade, INK } from './tex';

export type HandPose = 'open' | 'grab' | 'sponge' | 'roller' | 'vacuum' | 'build' | 'knife' | 'spoon';
export type HandAnim = 'none' | 'grab' | 'throw' | 'kick' | 'eat' | 'fix' | 'break';

export interface HandColors {
  light: string;
  dark: string;
  belly: string;
}
export function handColors(skinId?: string): HandColors {
  const id = skinId ?? save.skin;
  if (id === 'custom') {
    const c = save.avatar?.colors;
    const p = c?.primary ?? '#c9a3a3';
    return { light: p, dark: shade(p, -0.3), belly: c?.secondary ?? shade(p, 0.4) };
  }
  const s = skinById(id);
  return { light: s.light, dark: s.dark, belly: s.belly };
}

function drawHand(c: CanvasRenderingContext2D, pose: HandPose, col: HandColors, tool: string): void {
  const S = 256;
  c.clearRect(0, 0, S, S);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const closed = pose !== 'open' && pose !== 'build';
  if (pose === 'knife' || pose === 'spoon') tool = tool.startsWith('#') ? tool : '#ff5c7a';
  // ferramenta ATRÁS dos dedos
  if (pose === 'roller') {
    c.lineWidth = 9;
    c.strokeStyle = INK;
    c.beginPath();
    c.moveTo(130, 150);
    c.lineTo(110, 70);
    c.lineTo(150, 50);
    c.stroke();
    c.strokeStyle = '#d5d0e8';
    c.lineWidth = 5;
    c.stroke();
    // rolo
    c.save();
    c.translate(118, 40);
    c.rotate(-0.35);
    const g = c.createLinearGradient(0, -22, 0, 22);
    g.addColorStop(0, shade(tool, 0.35));
    g.addColorStop(0.5, tool);
    g.addColorStop(1, shade(tool, -0.25));
    c.fillStyle = tool.startsWith('#') ? g : '#ff9ad5';
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(-62, -22, 124, 44, 18);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.roundRect(-52, -16, 90, 8, 4);
    c.fill();
    c.restore();
  } else if (pose === 'vacuum') {
    c.fillStyle = '#8a5cff';
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(98, 40, 40, 120, 16);
    c.fill();
    c.stroke();
    c.fillStyle = '#46d9e6';
    c.beginPath();
    c.roundRect(84, 22, 68, 34, 12);
    c.fill();
    c.stroke();
    c.fillStyle = '#262238';
    c.beginPath();
    c.roundRect(92, 26, 52, 10, 5);
    c.fill();
  }
  else if (pose === 'knife' || pose === 'spoon') {
    // faca de cozinha de brinquedo (lâmina arredondada) ou colher de pau
    c.save();
    c.translate(118, 112);
    c.rotate(-0.75);
    c.strokeStyle = INK;
    c.lineWidth = 6;
    if (pose === 'knife') {
      c.fillStyle = '#e9ecf7';
      c.beginPath();
      c.moveTo(-8, -10);
      c.lineTo(-8, -118);
      c.quadraticCurveTo(30, -110, 26, -10);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(-2, -104, 7, 84);
    } else {
      c.fillStyle = '#d9a05a';
      c.beginPath();
      c.ellipse(4, -104, 24, 32, 0, 0, 7);
      c.fill();
      c.stroke();
      c.beginPath();
      c.roundRect(-4, -80, 16, 74, 7);
      c.fill();
      c.stroke();
    }
    c.fillStyle = tool;
    c.beginPath();
    c.roundRect(-10, -12, 38, 70, 12);
    c.fill();
    c.stroke();
    c.restore();
  }
  // (o antebraço agora é uma malha à parte — Forearm — que sai da borda da tela)
  // luva/pata
  const cx = 150,
    cy = 140;
  const grad = c.createRadialGradient(cx - 18, cy - 26, 6, cx, cy, 78);
  grad.addColorStop(0, shade(col.light, 0.35));
  grad.addColorStop(0.6, col.light);
  grad.addColorStop(1, col.dark);
  c.fillStyle = grad;
  c.beginPath();
  if (closed) {
    c.ellipse(cx, cy, 54, 48, -0.25, 0, 7);
  } else {
    c.ellipse(cx, cy + 6, 56, 50, -0.25, 0, 7);
  }
  c.fill();
  c.stroke();
  // dedos
  const fingers = closed ? 3 : 4;
  for (let i = 0; i < fingers; i++) {
    const a = -2.35 + i * (closed ? 0.42 : 0.38);
    const r = closed ? 18 : 21;
    const d = closed ? 48 : 58;
    const fx = cx + Math.cos(a) * d,
      fy = cy + Math.sin(a) * d + (closed ? 6 : 0);
    c.fillStyle = col.light;
    c.beginPath();
    c.ellipse(fx, fy, r, closed ? r * 0.85 : r * 1.15, a + 1.57, 0, 7);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.ellipse(fx - 4, fy - 5, r * 0.35, r * 0.25, a, 0, 7);
    c.fill();
  }
  // polegar
  c.fillStyle = col.light;
  c.beginPath();
  c.ellipse(cx - 56, cy + 18, 20, 26, -0.7, 0, 7);
  c.fill();
  c.stroke();
  // palma (cor da barriga)
  c.fillStyle = col.belly;
  c.globalAlpha = 0.9;
  c.beginPath();
  c.ellipse(cx - 6, cy + 14, 26, 22, -0.3, 0, 7);
  c.fill();
  c.globalAlpha = 1;
  // brilho
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.ellipse(cx + 18, cy - 22, 16, 9, -0.6, 0, 7);
  c.fill();
  pawRim(c, cx, cy, closed);
  // ferramenta NA FRENTE
  if (pose === 'sponge') {
    c.save();
    c.translate(122, 92);
    c.rotate(-0.25);
    c.fillStyle = '#ffd84a';
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(-58, -34, 116, 62, 18);
    c.fill();
    c.stroke();
    c.fillStyle = '#4fd67a';
    c.beginPath();
    c.roundRect(-58, -40, 116, 22, 10);
    c.fill();
    c.stroke();
    c.fillStyle = '#e8b52a';
    for (const [x, y, r] of [[-30, 5, 7], [0, 12, 5], [26, 0, 8], [40, 16, 4], [-12, -4, 4]]) c.beginPath(), c.arc(x, y, r, 0, 7), c.fill();
    c.restore();
    // bolhas
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.strokeStyle = '#9fd8ff';
    c.lineWidth = 3;
    for (const [x, y, r] of [[70, 50, 12], [96, 30, 8], [178, 56, 10]]) c.beginPath(), c.arc(x, y, r, 0, 7), c.fill(), c.stroke();
  } else if (pose === 'build') {
    // martelinho de brinquedo
    c.save();
    c.translate(108, 70);
    c.rotate(-0.5);
    c.fillStyle = '#c89a6a';
    c.strokeStyle = INK;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(-8, -10, 16, 80, 6);
    c.fill();
    c.stroke();
    c.fillStyle = '#ff5c7a';
    c.beginPath();
    c.roundRect(-34, -34, 68, 32, 12);
    c.fill();
    c.stroke();
    c.restore();
  }
}

/** luz de contorno (rim) quente em cima e sombra fria embaixo: assenta a mão 2D no cenário 3D */
function pawRim(c: CanvasRenderingContext2D, cx: number, cy: number, closed: boolean): void {
  const rx = closed ? 54 : 56;
  const ry = closed ? 48 : 50;
  const oy = closed ? 0 : 6;
  c.save();
  c.translate(cx, cy + oy);
  c.rotate(-0.25);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,248,230,0.55)';
  c.lineWidth = 5;
  c.beginPath();
  c.ellipse(0, 0, rx - 7, ry - 7, 0, Math.PI * 1.05, Math.PI * 1.55);
  c.stroke();
  c.strokeStyle = 'rgba(30,10,60,0.22)';
  c.lineWidth = 9;
  c.beginPath();
  c.ellipse(0, 0, rx - 8, ry - 8, 0, Math.PI * 0.05, Math.PI * 0.75);
  c.stroke();
  c.restore();
}

/** textura da manga: tecido na cor escura do personagem + punho na cor da barriga */
function sleeveTexture(col: HandColors): THREE.CanvasTexture {
  const [cv, c] = canvas(128, 256);
  const W = 128;
  const sleeve = shade(col.dark, 0.08);
  // corpo da manga (gradiente "cilíndrico": sombra à esquerda, brilho perto do centro, rim à direita)
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, shade(sleeve, -0.35));
  g.addColorStop(0.35, shade(sleeve, 0.18));
  g.addColorStop(0.7, sleeve);
  g.addColorStop(0.92, shade(sleeve, -0.18));
  g.addColorStop(1, shade(sleeve, 0.25));
  c.fillStyle = g;
  c.fillRect(4, 0, W - 8, 256);
  // dobras do tecido
  c.strokeStyle = 'rgba(20,6,40,0.18)';
  c.lineWidth = 4;
  for (const [y, a] of [[96, 18], [150, -14], [205, 20]] as const) {
    c.beginPath();
    c.moveTo(18, y);
    c.quadraticCurveTo(64, y + a, 92, y - 6);
    c.stroke();
  }
  // escurece em direção ao cotovelo (sai da luz)
  const v = c.createLinearGradient(0, 60, 0, 256);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(20,6,40,0.28)');
  c.fillStyle = v;
  c.fillRect(4, 60, W - 8, 196);
  // punho (canelado)
  const cg = c.createLinearGradient(0, 0, W, 0);
  cg.addColorStop(0, shade(col.belly, -0.3));
  cg.addColorStop(0.4, shade(col.belly, 0.2));
  cg.addColorStop(1, shade(col.belly, -0.15));
  c.fillStyle = cg;
  c.fillRect(4, 0, W - 8, 50);
  c.strokeStyle = 'rgba(20,6,40,0.18)';
  c.lineWidth = 3;
  for (let x = 18; x < W - 8; x += 14) {
    c.beginPath();
    c.moveTo(x, 6);
    c.lineTo(x, 44);
    c.stroke();
  }
  c.fillStyle = INK;
  c.fillRect(4, 48, W - 8, 6);
  // contorno nas laterais (traço 2D igual à mão)
  c.fillRect(0, 0, 8, 256);
  c.fillRect(W - 8, 0, 8, 256);
  c.fillStyle = 'rgba(255,248,230,0.5)';
  c.fillRect(W - 16, 60, 4, 196);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FA = new THREE.Vector3();
const FB = new THREE.Vector3();
/**
 * Antebraço da vista em 1ª pessoa: uma faixa texturizada (manga + punho) que vai do pulso
 * até um "cotovelo" calculado FORA do quadro (abaixo da borda de baixo, no canto do lado
 * da mão), para qualquer proporção/campo de visão — o braço nunca aparece cortado.
 * Filho da câmera; desenhado sem teste de profundidade (não atravessa paredes).
 */
export class Forearm {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private geo: THREE.BufferGeometry;
  private tex: THREE.CanvasTexture;
  constructor(
    col: HandColors,
    /** +1 = braço direito (sai pela direita), -1 = esquerdo */
    private side: 1 | -1,
    renderOrder: number,
    alphaTest = 0,
  ) {
    this.tex = sleeveTexture(col);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(18);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const sx = side > 0 ? [0, 1] : [1, 0];
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([sx[0], 1, sx[1], 1, sx[0], 0.8, sx[1], 0.8, sx[0], 0, sx[1], 0]), 2));
    this.geo.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, transparent: !alphaTest, alphaTest });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
  }
  /**
   * wrist: pulso no espaço da câmera; k: escala da mão; cam: câmera (para o frustum);
   * bend: -1..1 puxa o cotovelo para dentro/fora (animações).
   */
  set(wrist: THREE.Vector3, cam: THREE.PerspectiveCamera, k: number, bend = 0, widthK = 1): void {
    const ze = Math.min(-0.12, wrist.z + 0.1 * k);
    const de = -ze;
    const th = Math.tan((cam.fov * Math.PI) / 360);
    const hh = th * de;
    const hw = hh * cam.aspect;
    // cotovelo: bem abaixo da borda inferior, inclinado para o lado da mão
    const ey = -hh * 1.32 - 0.04 * k;
    const wx = (wrist.x * de) / Math.max(0.05, -wrist.z);
    const wy = (wrist.y * de) / Math.max(0.05, -wrist.z);
    bend = Math.max(-1, Math.min(1, bend || 0));
    let ex = wx + this.side * (wy - ey) * (0.62 + bend * 0.25);
    ex = this.side > 0 ? Math.min(ex, hw * 1.4) : Math.max(ex, -hw * 1.4);
    FB.set(ex, ey, ze);
    // direção no plano da tela
    FA.set(FB.x - wrist.x, FB.y - wrist.y, 0);
    const len = FA.length() || 1;
    FA.multiplyScalar(1 / len);
    const px = -FA.y;
    const py = FA.x;
    const w0 = 0.05 * k * widthK;
    const w1 = 0.054 * k * widthK;
    const w2 = 0.08 * k * widthK;
    const cuff = 0.045 * k;
    const p = this.pos;
    const row = (i: number, x: number, y: number, z: number, w: number) => {
      p[i * 6] = x - px * w;
      p[i * 6 + 1] = y - py * w;
      p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + px * w;
      p[i * 6 + 4] = y + py * w;
      p[i * 6 + 5] = z;
    };
    row(0, wrist.x - FA.x * 0.01 * k, wrist.y - FA.y * 0.01 * k, wrist.z, w0);
    row(1, wrist.x + FA.x * cuff, wrist.y + FA.y * cuff, wrist.z + (ze - wrist.z) * (cuff / len), w1);
    row(2, FB.x, FB.y, FB.z, w2);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

/* ---------------- curvas de animação ---------------- */
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeOut = (x: number) => 1 - (1 - x) * (1 - x) * (1 - x);
const easeIn = (x: number) => x * x * x;
/** sobe/desce entre a e b de t0 a t1 com a curva f */
const seg = (k: number, t0: number, t1: number, f: (x: number) => number) => f(clamp01((k - t0) / (t1 - t0)));
/** mola amortecida (passo semi-implícito) */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private d: number,
  ) {}
  step(target: number, dt: number): number {
    const h = Math.max(0, Math.min(dt, 1 / 30));
    this.v += (target - this.x) * this.k * h;
    this.v *= Math.exp(-this.d * h);
    this.x += this.v * h;
    return this.x;
  }
}
const GRIP = new THREE.Vector3();

export class Hand {
  readonly mesh: THREE.Mesh;
  readonly arm: Forearm;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private pose: HandPose | '' = '';
  private toolCol = '';
  private anim: HandAnim = 'none';
  private at = 0;
  private dur = 0.3;
  private t = 0;
  /** 0..1: esfregando / pintando (contínuo) */
  scrub = 0;
  /** 0..1: picando (faca sobe e desce rápido) */
  chop = 0;
  /** 0..1: mexendo a panela (círculos) */
  stir = 0;
  /** 0..1: carregando um arremesso (mão vai para trás) */
  charge = 0;
  /** pulso 0..1 no instante em que a faca bate na tábua (para tranco de câmera/partículas) */
  impact = 0;
  /** escala atual (squash & stretch) — para o item segurado acompanhar */
  squashX = 1;
  squashY = 1;
  /** escala da mão conforme a tela (1 = paisagem de referência) */
  k = 1;
  /** tamanho extra da mão (1 = padrão). A casa 3D usa menos quando o celular está em pé. */
  sizeMul = 1;
  private lagX = new Spring(140, 13);
  private lagY = new Spring(140, 13);
  private rotS = new Spring(90, 11);
  private walk = 0;
  private spd = 0;
  private chopPh = 0;
  private lastHit = false;
  private swap = 0;
  private base = new THREE.Vector3(0.27, -0.2, -0.5);
  private rot = 0;
  constructor(
    private camera: THREE.Camera,
    private col: HandColors,
  ) {
    [this.cv, this.cx] = canvas(256, 256);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
    this.mesh.renderOrder = 100;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
    // o antebraço é irmão da mão (filho da câmera), desenhado logo antes: o punho fica sob a pata
    this.arm = new Forearm(col, 1, 99);
    camera.add(this.arm.mesh);
    this.setPose('open');
    this.swap = 0;
  }
  setPose(p: HandPose, toolColor = '#ff7ad9'): void {
    if (p === this.pose && toolColor === this.toolCol) return;
    // troca de pose: um "mergulho" rápido esconde o salto do desenho
    if (this.pose) this.swap = 1;
    this.pose = p;
    this.toolCol = toolColor;
    drawHand(this.cx, p, this.col, toolColor);
    this.tex.needsUpdate = true;
  }
  play(a: HandAnim): void {
    this.anim = a;
    this.at = 0;
    this.dur = a === 'throw' ? 0.46 : a === 'kick' ? 0.36 : a === 'eat' ? 0.55 : a === 'fix' ? 0.55 : a === 'break' ? 0.34 : 0.32;
  }
  /** ponto entre os dedos (espaço da câmera): onde um item segurado deve ficar */
  grip(out: THREE.Vector3): THREE.Vector3 {
    const m = this.mesh;
    const s = m.scale.x;
    GRIP.set(0.006, 0.05, 0).multiplyScalar(s);
    const c = Math.cos(this.rot);
    const n = Math.sin(this.rot);
    return out.set(m.position.x + GRIP.x * c - GRIP.y * n, m.position.y + GRIP.x * n + GRIP.y * c, m.position.z + 0.02);
  }
  set visible(v: boolean) {
    this.mesh.visible = v;
    this.arm.mesh.visible = v;
  }
  get visible(): boolean {
    return this.mesh.visible;
  }
  /** speed: 0..1 velocidade de andar; look: delta de giro da câmera neste frame */
  update(dt: number, speed: number, lookDX: number, lookDY: number): void {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    this.t += dt;
    this.arm.mesh.visible = this.mesh.visible;
    // enquadramento responsivo: tamanho e posição a partir do frustum (retrato/paisagem)
    const cam = this.camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      const d = 0.5;
      const hh = Math.tan((cam.fov * Math.PI) / 360) * d;
      const hw = hh * cam.aspect;
      const s = Math.min(hh * 0.94, hw * 1.18) * this.sizeMul;
      this.k = s / 0.34;
      this.base.set(Math.min(0.27 * this.k, hw - s * 0.5), -hh + s * 0.48, -d);
    }
    const K = this.k;
    this.spd += (speed - this.spd) * Math.min(1, dt * 6);
    const sp = this.spd;
    this.walk += dt * (5.2 + sp * 5) * (sp > 0.04 ? 1 : 0);
    // atraso ao olhar: mola com leve overshoot (a mão "fica pra trás" e assenta)
    const lx = Math.max(-0.07, Math.min(0.07, this.lagX.step(-lookDX * 0.9, dt)));
    const ly = Math.max(-0.06, Math.min(0.06, this.lagY.step(lookDY * 0.9, dt)));
    // respiração / balanço parado
    const br = Math.sin(this.t * 1.7);
    const idleY = br * 0.006 * (1 - sp);
    const idleX = Math.sin(this.t * 0.73) * 0.004 * (1 - sp);
    // passo em "oito", sincronizado com a velocidade
    const bobX = Math.sin(this.walk) * 0.02 * sp;
    const bobY = -Math.abs(Math.cos(this.walk)) * 0.026 * sp + 0.012 * sp;
    let x = lx + bobX + idleX,
      y = ly + bobY + idleY,
      z = 0,
      rot = Math.sin(this.t * 0.9) * 0.025 * (1 - sp) + Math.sin(this.walk) * 0.05 * sp - lx * 2.2,
      sx = 1 + br * 0.006,
      sy = 1 - br * 0.006;
    if (this.scrub > 0) {
      const s = this.t * 13;
      const c = Math.cos(s);
      x += c * 0.04 * this.scrub - 0.06 * this.scrub;
      y += Math.sin(s) * 0.03 * this.scrub + 0.06 * this.scrub;
      z -= 0.05 * this.scrub;
      rot += Math.sin(s) * 0.12 * this.scrub;
      // a esponja "esmaga" quando empurra
      sx *= 1 + c * 0.04 * this.scrub;
      sy *= 1 - c * 0.04 * this.scrub;
    }
    this.impact = Math.max(0, this.impact - dt * 6);
    if (this.chop > 0.01) {
      // ciclo da faca: antecipação (sobe devagar) → golpe rápido → PAUSA no impacto → recupera
      this.chopPh = (this.chopPh + dt / 0.36) % 1;
      const p = this.chopPh;
      let h: number;
      if (p < 0.5) h = easeInOut(p / 0.5);
      else if (p < 0.62) h = 1 - 1.15 * seg(p, 0.5, 0.62, easeIn);
      else if (p < 0.76) h = -0.15;
      else h = -0.15 + 0.15 * seg(p, 0.76, 1, easeOut);
      const hit = p >= 0.62 && p < 0.76;
      if (hit && !this.lastHit) this.impact = 1;
      this.lastHit = hit;
      y += (h * 0.075 + 0.03) * this.chop;
      x -= 0.08 * this.chop;
      z -= 0.06 * this.chop;
      rot += (h * 0.38 - 0.06) * this.chop;
      if (hit) (sx *= 1 + 0.06 * this.chop), (sy *= 1 - 0.07 * this.chop);
    } else this.lastHit = false;
    if (this.stir > 0) {
      const s = this.t * 8;
      x += (Math.cos(s) * 0.05 - 0.07) * this.stir;
      y += (Math.sin(s) * 0.025 + 0.02) * this.stir;
      z -= 0.05 * this.stir;
      rot += Math.sin(s + 0.6) * 0.15 * this.stir;
    }
    if (this.charge > 0) {
      const c = easeOut(this.charge);
      const w = Math.sin(this.t * 30) * 0.004 * this.charge;
      x += 0.05 * c + w;
      y -= 0.06 * c;
      z += 0.08 * c;
      rot += 0.45 * c;
      // tensão: a mão aperta
      sx *= 1 - 0.05 * c;
      sy *= 1 + 0.04 * c;
    }
    if (this.anim !== 'none') {
      this.at += dt;
      const k = Math.min(1, this.at / this.dur);
      switch (this.anim) {
        case 'grab': {
          // antecipação (abre/sobe) → alcança → fecha e puxa (com leve overshoot)
          const a = seg(k, 0, 0.2, easeOut) * (1 - seg(k, 0.2, 0.45, easeInOut));
          const reach = seg(k, 0.15, 0.45, easeOut) * (1 - seg(k, 0.45, 1, easeInOut));
          const settle = Math.sin(seg(k, 0.55, 1, (q) => q) * Math.PI) * 0.35;
          y += a * 0.025 + reach * 0.03 - settle * 0.02;
          z -= reach * 0.1;
          x -= reach * 0.02;
          rot += a * 0.12 - reach * 0.08;
          const sq = Math.sin(seg(k, 0.4, 0.75, (q) => q) * Math.PI);
          sx *= 1 + sq * 0.08;
          sy *= 1 - sq * 0.1;
          break;
        }
        case 'throw': {
          // puxa para trás (antecipação) → lança rápido (stretch) → acompanha para baixo (follow-through)
          const back = seg(k, 0, 0.3, easeInOut) * (1 - seg(k, 0.3, 0.45, easeIn));
          const fwd = seg(k, 0.3, 0.48, easeOut);
          const fol = seg(k, 0.48, 1, easeInOut);
          const out = fwd * (1 - fol);
          y += back * 0.05 + out * 0.09 - fwd * fol * 0.02 * (1 - k);
          x -= out * 0.13;
          z += back * 0.05 - out * 0.2;
          rot += back * 0.45 - out * 0.65;
          const st = Math.sin(seg(k, 0.3, 0.6, (q) => q) * Math.PI);
          sx *= 1 - st * 0.08 + back * 0.04;
          sy *= 1 + st * 0.12 - back * 0.05;
          break;
        }
        case 'kick':
        case 'break': {
          const wind = seg(k, 0, 0.25, easeInOut) * (1 - seg(k, 0.25, 0.4, easeIn));
          const hit = seg(k, 0.25, 0.42, easeOut) * (1 - seg(k, 0.5, 1, easeInOut));
          z += wind * 0.05 - hit * 0.2;
          x += wind * 0.03 - hit * 0.1;
          rot += wind * 0.2 - hit * 0.5;
          sx *= 1 + hit * 0.1;
          sy *= 1 + hit * 0.06;
          break;
        }
        case 'eat': {
          const e = seg(k, 0, 0.4, easeInOut) * (1 - seg(k, 0.6, 1, easeInOut));
          const nib = e * Math.sin(k * Math.PI * 6) * 0.01;
          x -= e * 0.22;
          y += e * 0.1 + nib;
          z += e * 0.05;
          rot += e * 0.4;
          break;
        }
        case 'fix': {
          const e = Math.sin(k * Math.PI);
          y += Math.sin(k * Math.PI * 2) * 0.03 * e;
          rot += Math.sin(k * Math.PI * 3) * 0.3 * e;
          break;
        }
      }
      if (k >= 1) this.anim = 'none';
    }
    if (this.swap > 0) {
      this.swap = Math.max(0, this.swap - dt / 0.16);
      const e = Math.sin(this.swap * Math.PI);
      y -= e * 0.03;
      sx *= 1 - e * 0.06;
      sy *= 1 - e * 0.06;
    }
    // a rotação passa por uma mola: nada "estala"
    rot = this.rotS.step(rot, dt);
    this.rot = rot;
    this.squashX = sx;
    this.squashY = sy;
    this.mesh.position.set(this.base.x + x * K, this.base.y + y * K, this.base.z + z * K);
    this.mesh.rotation.z = rot;
    this.mesh.scale.set(sx * K, sy * K, K);
    // pulso: canto inferior direito da pata (o punho da manga fica por baixo da pata)
    const wxl = 0.062 * sx * K;
    const wyl = -0.058 * sy * K;
    const c = Math.cos(rot);
    const n = Math.sin(rot);
    WR.set(this.mesh.position.x + wxl * c - wyl * n, this.mesh.position.y + wxl * n + wyl * c, this.mesh.position.z - 0.001);
    if (cam.isPerspectiveCamera) this.arm.set(WR, cam, K * Math.max(sx, sy), -rot * 0.4);
  }
  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
    this.arm.dispose();
  }
}
const WR = new THREE.Vector3();
