/* ============================================================
 *  AFORDÂNCIAS VISUAIS (kit de interação 3D)
 *   - HoverHighlight: contorno pulsante no que a mão mira + rótulo minúsculo
 *     preso ao objeto ("Geladeira · Tomate").
 *   - SnapGlows: discos verdes nos lugares que ACEITAM o que você segura;
 *     "+" quando vai combinar (ingrediente → prato).
 *   - Beacon: dica de "vá ali" — contorno verde + seta 3D quicando + seta na
 *     borda da tela quando o alvo está fora de vista. Use com Hesitation
 *     (só aparece se o jogador hesitar).
 *  Tudo sem alocação por quadro.
 * ============================================================ */
import * as THREE from 'three';

const V = new THREE.Vector3();
const COL_WARN = new THREE.Color('#ff5c7a');
const V2 = new THREE.Vector3();
const CSS = `
.ix-tag{position:absolute;left:0;top:0;padding:2px 8px;border-radius:9px;background:rgba(16,6,40,.66);color:#fff;font:600 12px/1.2 var(--font,'Fredoka',system-ui,sans-serif);white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .12s;will-change:transform;z-index:3}
.ix-tag.on{opacity:1}
.ix-tag.hot{background:rgba(255,92,122,.85)}
.ix-tag.tip{background:#fff3a0;color:#2a0b5c;font-size:13px;box-shadow:0 2px 0 #2a0b5c55;border:2px solid #2a0b5c;padding:3px 10px}
.ix-arrow{position:absolute;left:0;top:0;width:54px;height:54px;margin:-27px 0 0 -27px;pointer-events:none;display:none;filter:drop-shadow(0 2px 0 #2a0b5c);z-index:3}
.ix-arrow svg{width:100%;height:100%}
`;
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** rótulo DOM preso a um ponto do mundo */
export class WorldTag {
  /** margem do topo (px) — abaixo do HUD do jogo */
  static top = 84;
  readonly el: HTMLDivElement;
  private txt = '';
  private cls = '';
  x = 0;
  y = 0;
  z = 0;
  constructor(layer: HTMLElement, extra = '') {
    css();
    this.el = document.createElement('div');
    this.el.className = 'ix-tag' + (extra ? ' ' + extra : '');
    layer.appendChild(this.el);
  }
  set(txt: string, cls = ''): void {
    if (txt !== this.txt) {
      this.txt = txt;
      this.el.textContent = txt;
    }
    if (cls !== this.cls) {
      if (this.cls) this.el.classList.remove(this.cls);
      if (cls) this.el.classList.add(cls);
      this.cls = cls;
    }
    this.el.classList.toggle('on', !!txt);
  }
  at(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  frame(cam: THREE.Camera, w: number, h: number): void {
    if (!this.txt) return;
    V.set(this.x, this.y, this.z).project(cam);
    const vis = V.z < 1 && Math.abs(V.x) < 1.1 && Math.abs(V.y) < 1.1;
    this.el.style.visibility = vis ? '' : 'hidden';
    if (vis) {
      // nunca embaixo do HUD do topo nem cortado nas laterais
      const sx = Math.max(70, Math.min(w - 70, ((V.x + 1) / 2) * w));
      const sy = Math.max(WorldTag.top, ((1 - V.y) / 2) * h);
      this.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
  /** posição direta em px de tela (ex.: perto de uma seta de borda) */
  screen(x: number, y: number, w: number): void {
    if (!this.txt) return;
    this.el.style.visibility = '';
    const half = this.el.offsetWidth / 2 + 8;
    const sx = Math.max(half, Math.min(w - half, x));
    this.el.style.transform = `translate(${sx.toFixed(1)}px,${Math.max(WorldTag.top, y).toFixed(1)}px) translate(-50%,-50%)`;
  }
  dispose(): void {
    this.el.remove();
  }
}

function boxLines(color: string): THREE.LineSegments {
  const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const l = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false }));
  l.renderOrder = 6;
  l.visible = false;
  return l;
}
function fitBox(o: THREE.Object3D, b: THREE.Box3, grow: number): void {
  b.getCenter(V);
  b.getSize(V2);
  o.position.copy(V);
  o.scale.set(V2.x * grow + 0.02, V2.y * grow + 0.02, V2.z * grow + 0.02);
}

export class HoverHighlight {
  readonly line: THREE.LineSegments;
  readonly tag: WorldTag;
  private on = false;
  private col: THREE.Color;
  constructor(
    scene: THREE.Scene,
    layer: HTMLElement,
    readonly color = '#ffe14a',
  ) {
    this.col = new THREE.Color(color);
    this.line = boxLines(color);
    scene.add(this.line);
    this.tag = new WorldTag(layer);
  }
  /** mostra contorno na caixa e o rótulo acima dela. warn = vermelho (fogo, não cabe) */
  show(b: THREE.Box3, label: string, warn = false): void {
    this.on = true;
    fitBox(this.line, b, 1.04);
    this.line.visible = true;
    (this.line.material as THREE.LineBasicMaterial).color.copy(warn ? COL_WARN : this.col);
    this.tag.set(label, warn ? 'hot' : '');
    this.tag.at((b.min.x + b.max.x) / 2, b.max.y + 0.06, (b.min.z + b.max.z) / 2);
  }
  hide(): void {
    if (!this.on) return;
    this.on = false;
    this.line.visible = false;
    this.tag.set('');
  }
  frame(cam: THREE.Camera, w: number, h: number, time: number): void {
    if (!this.on) return;
    (this.line.material as THREE.LineBasicMaterial).opacity = 0.6 + Math.sin(time * 8) * 0.3;
    this.tag.frame(cam, w, h);
  }
  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.line.parent?.remove(this.line);
    this.tag.dispose();
  }
}

/** discos "pode soltar aqui" (verde) e "+" (combinar) — pool fixo */
export class SnapGlows {
  private discs: THREE.Mesh[] = [];
  private plus: THREE.Sprite[] = [];
  private n = 0;
  private np = 0;
  private dg: THREE.RingGeometry;
  private dm: THREE.MeshBasicMaterial;
  private pm: THREE.SpriteMaterial;
  constructor(
    private scene: THREE.Scene,
    readonly max = 24,
  ) {
    this.dg = new THREE.RingGeometry(0.55, 1, 28);
    this.dg.rotateX(-Math.PI / 2);
    this.dm = new THREE.MeshBasicMaterial({ color: '#3effa0', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, depthTest: false });
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    c.beginPath();
    c.arc(32, 32, 28, 0, 7);
    c.fillStyle = '#3effa0';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#2a0b5c';
    c.stroke();
    c.fillStyle = '#2a0b5c';
    c.fillRect(17, 28, 30, 8);
    c.fillRect(28, 17, 8, 30);
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    this.pm = new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true });
  }
  begin(): void {
    this.n = 0;
    this.np = 0;
  }
  /** disco no topo de um lugar que aceita (x,y,z = centro da superfície; r = raio) */
  add(x: number, y: number, z: number, r: number, combine = false): void {
    if (this.n < this.max) {
      let d = this.discs[this.n];
      if (!d) {
        d = new THREE.Mesh(this.dg, this.dm);
        d.renderOrder = 4;
        this.scene.add(d);
        this.discs.push(d);
      }
      d.visible = true;
      d.position.set(x, y + 0.012, z);
      d.scale.setScalar(r);
      this.n++;
    }
    if (combine && this.np < 8) {
      let p = this.plus[this.np];
      if (!p) {
        p = new THREE.Sprite(this.pm);
        p.renderOrder = 8;
        this.scene.add(p);
        this.plus.push(p);
      }
      p.visible = true;
      p.position.set(x, y + 0.32, z);
      this.np++;
    }
  }
  end(time: number): void {
    for (let i = this.n; i < this.discs.length; i++) this.discs[i].visible = false;
    for (let i = this.np; i < this.plus.length; i++) this.plus[i].visible = false;
    this.dm.opacity = 0.7 + Math.sin(time * 5) * 0.25;
    const s = 0.16 + Math.abs(Math.sin(time * 4)) * 0.03;
    for (let i = 0; i < this.np; i++) {
      this.plus[i].scale.set(s, s, 1);
      this.plus[i].position.y += Math.sin(time * 4 + i) * 0.002;
    }
  }
  dispose(): void {
    for (const d of this.discs) d.parent?.remove(d);
    for (const p of this.plus) p.parent?.remove(p);
    this.dg.dispose();
    this.dm.dispose();
    this.pm.map?.dispose();
    this.pm.dispose();
  }
}

/** "vá ali": contorno verde + seta 3D + seta na borda da tela + balãozinho de dica */
export class Beacon {
  private line: THREE.LineSegments;
  private cone: THREE.Mesh;
  private arrow: HTMLDivElement;
  readonly tag: WorldTag;
  private box = new THREE.Box3();
  private active = 0; // 0 nada, 1 suave, 2 forte
  constructor(
    scene: THREE.Scene,
    layer: HTMLElement,
  ) {
    css();
    this.line = boxLines('#3effa0');
    const cg = new THREE.ConeGeometry(0.12, 0.26, 4);
    cg.rotateX(Math.PI);
    this.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: '#3effa0', depthTest: false, transparent: true, opacity: 0.95, toneMapped: false }));
    this.cone.renderOrder = 7;
    this.cone.visible = false;
    scene.add(this.line, this.cone);
    this.arrow = document.createElement('div');
    this.arrow.className = 'ix-arrow';
    this.arrow.innerHTML = '<svg viewBox="0 0 40 40"><path d="M20 38L4 18h9V3h14v15h9z" fill="#3effa0" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/></svg>';
    layer.appendChild(this.arrow);
    this.tag = new WorldTag(layer, 'tip');
  }
  /** level: 0 apaga, 1 só contorno suave, 2 contorno + setas + texto */
  set(b: THREE.Box3 | null, level: 0 | 1 | 2, tip = ''): void {
    this.active = b ? level : 0;
    if (b) this.box.copy(b);
    this.tag.set(this.active === 2 ? tip : '');
    if (!this.active) {
      this.line.visible = false;
      this.cone.visible = false;
      this.arrow.style.display = 'none';
    }
  }
  frame(cam: THREE.PerspectiveCamera, w: number, h: number, time: number, hideOutline = false): void {
    if (!this.active) return;
    const b = this.box;
    const strong = this.active === 2;
    const pulse = 0.5 + Math.sin(time * 6) * 0.5;
    fitBox(this.line, b, strong ? 1.04 + pulse * 0.05 : 1.02);
    this.line.visible = !hideOutline;
    (this.line.material as THREE.LineBasicMaterial).opacity = strong ? 0.7 + pulse * 0.3 : 0.3 + pulse * 0.25;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    const top = b.max.y;
    const far = Math.hypot(cx - cam.position.x, cz - cam.position.z) > 1.1;
    this.cone.visible = strong && far;
    this.cone.position.set(cx, top + 0.22 + Math.abs(Math.sin(time * 4)) * 0.1, cz);
    this.cone.rotation.y = time * 2;
    this.tag.at(cx, top + (far ? 0.45 : 0.12), cz);
    this.tag.frame(cam, w, h);
    if (!strong) {
      this.arrow.style.display = 'none';
      return;
    }
    V2.set(cx, (b.min.y + top) / 2, cz).project(cam);
    const inside = V2.z < 1 && Math.abs(V2.x) < 0.92 && Math.abs(V2.y) < 0.9;
    if (inside) {
      this.arrow.style.display = 'none';
      return;
    }
    let sx = ((V2.x + 1) / 2) * w;
    let sy = ((1 - V2.y) / 2) * h;
    if (V2.z > 1) {
      sx = w - sx;
      sy = h - sy;
    }
    const mx = w / 2;
    const my = h / 2;
    let dx = sx - mx;
    // atrás de você: seta no meio da lateral ("vire para lá"), longe dos botões de baixo
    const dy = V2.z > 1 ? 0 : sy - my;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dx = 1;
    const ang = Math.atan2(dy, dx);
    const kx = (w / 2 - 40) / Math.max(1e-3, Math.abs(Math.cos(ang)));
    const ky = (h / 2 - 90) / Math.max(1e-3, Math.abs(Math.sin(ang)));
    const r = Math.min(kx, ky);
    const ax = mx + Math.cos(ang) * r;
    const ay = my + Math.sin(ang) * r;
    this.arrow.style.display = 'block';
    this.arrow.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) rotate(${((ang * 180) / Math.PI - 90).toFixed(1)}deg)`;
    // alvo fora da tela: o balão da dica acompanha a seta (para dentro)
    this.tag.screen(ax - Math.cos(ang) * 75, ay - Math.sin(ang) * 45, w);
  }
  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.cone.geometry.dispose();
    (this.cone.material as THREE.Material).dispose();
    this.line.parent?.remove(this.line);
    this.cone.parent?.remove(this.cone);
    this.arrow.remove();
    this.tag.dispose();
  }
}
