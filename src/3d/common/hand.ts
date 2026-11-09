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
  // braço (tubo que sai do canto)
  c.fillStyle = col.light;
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(150, 262);
  c.quadraticCurveTo(150, 200, 128, 175);
  c.lineTo(210, 150);
  c.quadraticCurveTo(232, 210, 250, 262);
  c.closePath();
  c.fill();
  c.stroke();
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

export class Hand {
  readonly mesh: THREE.Mesh;
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
  private lagX = 0;
  private lagY = 0;
  private walk = 0;
  private base = new THREE.Vector3(0.27, -0.2, -0.5);
  constructor(
    camera: THREE.Camera,
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
    this.setPose('open');
  }
  setPose(p: HandPose, toolColor = '#ff7ad9'): void {
    if (p === this.pose && toolColor === this.toolCol) return;
    this.pose = p;
    this.toolCol = toolColor;
    drawHand(this.cx, p, this.col, toolColor);
    this.tex.needsUpdate = true;
  }
  play(a: HandAnim): void {
    this.anim = a;
    this.at = 0;
    this.dur = a === 'throw' ? 0.38 : a === 'kick' ? 0.3 : a === 'eat' ? 0.45 : a === 'fix' ? 0.5 : a === 'break' ? 0.3 : 0.22;
  }
  /** speed: 0..1 velocidade de andar; look: delta de giro da câmera neste frame */
  update(dt: number, speed: number, lookDX: number, lookDY: number): void {
    this.t += dt;
    this.walk += dt * (4 + speed * 6) * (speed > 0.05 ? 1 : 0);
    // atraso ao olhar (a mão "fica pra trás" e volta com mola)
    this.lagX += (-lookDX * 0.9 - this.lagX) * Math.min(1, dt * 10);
    this.lagY += (lookDY * 0.9 - this.lagY) * Math.min(1, dt * 10);
    const lx = Math.max(-0.06, Math.min(0.06, this.lagX));
    const ly = Math.max(-0.05, Math.min(0.05, this.lagY));
    const idle = Math.sin(this.t * 1.8) * 0.006;
    const bobX = Math.sin(this.walk) * 0.018 * speed;
    const bobY = -Math.abs(Math.cos(this.walk)) * 0.02 * speed;
    let x = this.base.x + lx + bobX,
      y = this.base.y + ly + bobY + idle,
      z = this.base.z,
      rot = Math.sin(this.t * 1.3) * 0.02 - lx * 2,
      sc = 1;
    if (this.scrub > 0) {
      const s = this.t * 14;
      x += Math.cos(s) * 0.035 * this.scrub - 0.06 * this.scrub;
      y += Math.sin(s) * 0.03 * this.scrub + 0.06 * this.scrub;
      z -= 0.04 * this.scrub;
      rot += Math.sin(s) * 0.12 * this.scrub;
    }
    if (this.chop > 0) {
      const s = this.t * 22;
      const k = Math.abs(Math.sin(s));
      y += (k * 0.07 - 0.02) * this.chop + 0.03 * this.chop;
      x -= 0.08 * this.chop;
      z -= 0.06 * this.chop;
      rot += (k * 0.35 - 0.1) * this.chop;
    }
    if (this.stir > 0) {
      const s = this.t * 9;
      x += (Math.cos(s) * 0.05 - 0.07) * this.stir;
      y += (Math.sin(s) * 0.025 + 0.02) * this.stir;
      z -= 0.05 * this.stir;
      rot += Math.sin(s) * 0.15 * this.stir;
    }
    if (this.charge > 0) {
      const w = Math.sin(this.t * 30) * 0.004 * this.charge;
      x += 0.05 * this.charge + w;
      y -= 0.06 * this.charge;
      z += 0.08 * this.charge;
      rot += 0.45 * this.charge;
    }
    if (this.anim !== 'none') {
      this.at += dt;
      const k = Math.min(1, this.at / this.dur);
      const e = Math.sin(k * Math.PI);
      switch (this.anim) {
        case 'grab':
          sc = 1 - e * 0.12;
          z -= e * 0.08;
          y += e * 0.04;
          break;
        case 'throw': {
          // puxa para trás e lança
          const back = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
          const fwd = k < 0.35 ? 0 : Math.sin(((k - 0.35) / 0.65) * Math.PI);
          y += back * 0.05 + fwd * 0.08;
          x -= fwd * 0.12;
          z -= fwd * 0.18 - back * 0.04;
          rot += back * 0.4 - fwd * 0.6;
          break;
        }
        case 'kick':
        case 'break':
          z -= e * 0.2;
          x -= e * 0.1;
          rot -= e * 0.5;
          sc = 1 + e * 0.1;
          break;
        case 'eat':
          x -= e * 0.22;
          y += e * 0.1;
          z += e * 0.05;
          rot += e * 0.4;
          break;
        case 'fix':
          y += Math.sin(k * Math.PI * 2) * 0.03;
          rot += Math.sin(k * Math.PI * 3) * 0.3;
          break;
      }
      if (k >= 1) this.anim = 'none';
    }
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.z = rot;
    this.mesh.scale.setScalar(sc);
  }
  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}
