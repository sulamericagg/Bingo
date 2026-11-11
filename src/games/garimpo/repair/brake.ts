/* ============================================================
 *  CONSERTOS — FREIO FALHOU (emergência dirigindo, não é menu).
 *  O pedal de freio para de funcionar: luz + alarme + borda vermelha. O jogador reduz a
 *  marcha (difícil: câmbio H; simples/automático: botão grande "reduzir marcha"), liga o
 *  freio-motor (freio de escape) e vai para a RAMPA DE ESCAPE (leito de cascalho/areia
 *  que segura o caminhão). Parou → minijogo de conserto do freio.
 *  Funciona com qualquer alvo (máquina do garimpo ou carreta da estrada) via BrakeTarget.
 *  EscapeBed: leito de cascalho que aparece à frente no garimpo (sem estrada).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { tap as haptic } from '../../../core/haptics';
import { speak } from '../../voo/voice';
import type { Terrain } from '../terrain';
import { RIC } from './parts';
import { rs } from './sound';

/** desaceleração (m/s²) por marcha (1..6) com o freio-motor, de escape e do cascalho */
export const ENGINE_DECEL = [0, 2.7, 2.0, 1.45, 1.0, 0.65, 0.4];
export const JAKE_DECEL = 1.4;
export const GRAVEL_DECEL = 6.5;

export interface BrakeTarget {
  /** velocidade (m/s, para a frente) */
  speed(): number;
  /** marcha engatada agora (1..6) — modo difícil com câmbio manual */
  gear(): number;
  /** usa o câmbio H do painel (sem botão de reduzir) */
  manual(): boolean;
  /** posição e guinada (para a seta até a rampa) */
  x(): number;
  z(): number;
  /** está no leito de cascalho? */
  onRamp(): boolean;
  /** onde fica a rampa (null = nenhuma por perto) e distância ao longo do caminho */
  ramp(): { x: number; z: number; dist: number } | null;
}

export class BrakeEmergency {
  active = false;
  /** marcha "virtual" (botão de reduzir) */
  vgear = 5;
  jake = false;
  private stopT = 0;
  private alarmT = 0;
  private shiftCd = 0;
  private time = 0;
  private gravT = 0;
  private el: HTMLDivElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private tgt: BrakeTarget | null = null;
  private lastKey = '';
  /** desaceleração extra a aplicar neste quadro (m/s²) */
  decel = 0;
  onStop: (() => void) | null = null;
  /** ângulo da câmera para a seta */
  camYaw = 0;

  constructor(parent: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'gbr-emg';
    el.hidden = true;
    el.innerHTML = `<div class="gbr-red"></div>
      <div class="gbr-warn">${RIC.brake}<span></span></div>
      <div class="gbr-gauge"><span class="gbr-ar">${RIC.ramp}</span><b class="gbr-dist"></b><i><u></u></i><b class="gbr-kmh"></b></div>
      <div class="gbr-emg-btns">
        <button class="gbr-ebtn down" data-touch-ignore>${RIC.gearDown}<b>5</b></button>
        <button class="gbr-ebtn jake" data-touch-ignore>${RIC.jake}</button>
      </div>`;
    parent.appendChild(el);
    this.el = el;
    const down = this.q('.down');
    const jake = this.q('.jake');
    const press = (b: HTMLElement, f: () => void) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        f();
      });
    press(down, () => this.downshift());
    press(jake, () => {
      this.jake = !this.jake;
      if (this.jake) rs.jake();
      haptic('medium');
      jake.classList.toggle('on', this.jake);
    });
  }

  start(tg: BrakeTarget): void {
    this.tgt = tg;
    this.active = true;
    this.time = 0;
    this.stopT = 0;
    this.alarmT = 0;
    this.jake = false;
    this.vgear = Math.max(2, Math.min(6, tg.gear() || 5));
    this.el.hidden = false;
    this.q('.jake').classList.remove('on');
    this.q('.gbr-warn span').textContent = t('gb.rep.noBrake', 'SEM FREIO!');
    rs.bang();
    haptic('heavy');
    speak(t('gb.rep.v.noBrake', 'O freio falhou! Reduza a marcha, ligue o freio-motor e vá para a rampa de escape!'), { urgent: true });
    this.lastKey = '';
  }
  stop(): void {
    this.active = false;
    this.el.hidden = true;
    this.decel = 0;
    this.tgt = null;
  }
  downshift(): void {
    if (this.shiftCd > 0 || this.vgear <= 1) return;
    this.vgear--;
    this.shiftCd = 0.45;
    rs.shift();
    rs.jake();
    haptic('heavy');
    const b = this.q('.down');
    b.classList.remove('hot');
    void b.offsetWidth;
  }

  /** um quadro: calcula a desaceleração e cuida da tela */
  step(dt: number, visible: boolean): void {
    const tg = this.tgt;
    if (!this.active || !tg) return;
    this.time += dt;
    this.shiftCd = Math.max(0, this.shiftCd - dt);
    const manual = tg.manual();
    const g = manual ? Math.max(1, Math.min(6, tg.gear() || 6)) : this.vgear;
    const v = Math.abs(tg.speed());
    const ramp = tg.onRamp();
    // no neutro/ré nada segura (só o cascalho)
    const eng = manual && tg.gear() <= 0 ? 0 : ENGINE_DECEL[g];
    this.decel = eng + (this.jake ? JAKE_DECEL : 0) + (ramp ? GRAVEL_DECEL : 0);
    if (ramp) {
      this.gravT -= dt;
      if (this.gravT <= 0 && v > 1.5) {
        this.gravT = 0.28;
        rs.gravel();
        haptic('light');
      }
    }
    // alarme (bip-bip) enquanto anda
    this.alarmT -= dt;
    if (this.alarmT <= 0 && v > 1) {
      this.alarmT = 0.9;
      rs.alarm();
    }
    if (v < 0.8) {
      this.stopT += dt;
      if (this.stopT > 1.0) {
        rs.cheer();
        speak(t('gb.rep.v.stopped', 'Ufa! Parou. Agora conserte o freio.'), { urgent: true });
        const cb = this.onStop;
        this.stop();
        cb?.();
        return;
      }
    } else this.stopT = 0;
    this.el.hidden = !visible;
    // tela (só quando muda)
    const r = tg.ramp();
    const kmh = Math.round(v * 3.6);
    let ang = 0;
    if (r) {
      const a = Math.atan2(r.x - tg.x(), r.z - tg.z());
      ang = -(a - this.camYaw);
    }
    const key = `${kmh}|${g}|${manual}|${r ? Math.round(r.dist / 5) : -1}|${Math.round(ang * 20)}|${ramp}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.q('.gbr-kmh').textContent = kmh + ' km/h';
    this.q('.gbr-gauge u').style.left = Math.min(100, (v / 22) * 100).toFixed(0) + '%';
    const ar = this.q('.gbr-ar');
    ar.hidden = !r;
    this.q('.gbr-dist').textContent = r ? (ramp ? '✓' : Math.round(r.dist) + ' m') : '';
    ar.style.transform = r && !ramp ? `rotate(${ang.toFixed(2)}rad)` : '';
    const down = this.q('.down');
    down.hidden = manual;
    down.querySelector('b')!.textContent = String(g);
    // reduzir pisca enquanto ainda dá para reduzir e está rápido
    down.classList.toggle('hot', g > 2 && v > 4);
    this.q('.jake').classList.toggle('hot', !this.jake);
  }
  dispose(): void {
    this.el.remove();
  }
}

/* ============================== leito de cascalho (garimpo) ============================== */
let gravelTex: THREE.CanvasTexture | null = null;
function gravel(): THREE.CanvasTexture {
  if (gravelTex) return gravelTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c8b68e';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 140 + Math.random() * 90;
    x.fillStyle = `rgb(${v},${v - 14},${v - 40})`;
    x.beginPath();
    x.arc(Math.random() * 128, Math.random() * 128, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
    x.fill();
  }
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  gravelTex = tx;
  return tx;
}
/** placa azul com a rampa desenhada + texto */
let signMat: THREE.MeshBasicMaterial | null = null;
let signGeo: THREE.PlaneGeometry | null = null;
export function rampSign(): THREE.Mesh {
  if (signMat && signGeo) return new THREE.Mesh(signGeo, signMat);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1d5fa8';
  x.beginPath();
  x.roundRect(4, 4, 248, 152, 16);
  x.fill();
  x.strokeStyle = '#fff';
  x.lineWidth = 6;
  x.stroke();
  x.fillStyle = '#e8d9a8';
  x.beginPath();
  x.moveTo(30, 110);
  x.lineTo(226, 110);
  x.lineTo(226, 50);
  x.closePath();
  x.fill();
  x.strokeStyle = '#fff';
  x.lineWidth = 10;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(60, 96);
  x.lineTo(150, 62);
  x.moveTo(132, 52);
  x.lineTo(152, 62);
  x.lineTo(140, 80);
  x.stroke();
  x.fillStyle = '#fff';
  x.font = '800 22px sans-serif';
  x.textAlign = 'center';
  x.fillText(t('gb.rep.rampSign', 'RAMPA DE ESCAPE'), 128, 145);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  signMat = new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide });
  signGeo = new THREE.PlaneGeometry(3.2, 2);
  return new THREE.Mesh(signGeo, signMat);
}

/** leito de cascalho (garimpo, sem estrada): retângulo seguindo o terreno + postes e areia no fim */
export class EscapeBed {
  readonly group = new THREE.Group();
  x = 0;
  z = 0;
  yaw = 0;
  len = 36;
  wid = 7;
  constructor(T: Terrain, x: number, z: number, yaw: number, len = 36) {
    this.len = len;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    const nx = 4;
    const nz = 16;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
    const idx: number[] = [];
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const lx = (i / nx - 0.5) * this.wid;
        const lz = (j / nz) * this.len;
        const wx = x + c * lx + s * lz;
        const wz = z - s * lx + c * lz;
        const k = j * (nx + 1) + i;
        // cascalho fofo: borda levemente mais alta, sobe no fim (montinho de areia)
        const rise = Math.max(0, (j / nz - 0.75) * 4) * 0.5;
        pos.set([wx, T.heightAt(wx, wz) + 0.1 + rise + (i === 0 || i === nx ? 0.12 : 0), wz], k * 3);
        uv.set([i * 0.8, j * 0.8], k * 2);
        if (i < nx && j < nz) idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const bed = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: gravel() }));
    bed.receiveShadow = true;
    this.group.add(bed);
    // postes zebrados nas laterais e pneus/areia no fim
    const post = new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6);
    const pm = [new THREE.MeshLambertMaterial({ color: 0xff7a1a }), new THREE.MeshLambertMaterial({ color: 0xffffff })];
    for (let j = 0; j <= 6; j++)
      for (const side of [-1, 1]) {
        const lx = side * (this.wid / 2 + 0.4);
        const lz = (j / 6) * this.len;
        const wx = x + c * lx + s * lz;
        const wz = z - s * lx + c * lz;
        const m = new THREE.Mesh(post, pm[j % 2]);
        m.position.set(wx, T.heightAt(wx, wz) + 0.65, wz);
        this.group.add(m);
      }
    const tyreG = new THREE.TorusGeometry(0.45, 0.2, 6, 12);
    const tyreM = new THREE.MeshLambertMaterial({ color: 0x1c1c1f });
    for (let i = 0; i < 5; i++) {
      const lx = (i - 2) * 1.3;
      const lz = this.len + 0.8;
      const wx = x + c * lx + s * lz;
      const wz = z - s * lx + c * lz;
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(tyreG, tyreM);
        m.rotation.x = Math.PI / 2;
        m.position.set(wx, T.heightAt(wx, wz) + 0.2 + k * 0.38, wz);
        this.group.add(m);
      }
    }
    // placa na entrada
    const sg = rampSign();
    const sx = x + c * (this.wid / 2 + 1.6) - s * 2;
    const sz = z - s * (this.wid / 2 + 1.6) - c * 2;
    sg.position.set(sx, T.heightAt(sx, sz) + 2.6, sz);
    sg.rotation.y = yaw + Math.PI;
    this.group.add(sg);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x8b9096 }));
    pole.position.set(sx, T.heightAt(sx, sz) + 1.1, sz);
    this.group.add(pole);
  }
  /** ponto (x,z) está no leito? */
  inside(px: number, pz: number): boolean {
    const dx = px - this.x;
    const dz = pz - this.z;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < this.wid / 2 + 0.6 && lz > -1 && lz < this.len + 1.5;
  }
  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g && g !== signGeo) g.dispose();
    });
  }
}
