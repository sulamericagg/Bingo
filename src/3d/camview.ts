/* ============================================================
 *  CÂMERA COMPARTILHADA DOS JOGOS 3D — modos estilo "botão de
 *  câmera" dos jogos de bloco/sandbox:
 *    1ª pessoa  →  3ª pessoa (atrás)  →  3ª pessoa de frente (selfie)  →  1ª …
 *
 *  Uso (qualquer jogo 3D):
 *    const cam = new CamView('meujogo');            // lembra o modo por jogo (localStorage)
 *    cam.mountButton(topBar, { label: t(...) });    // botãozinho no topo; toque = próximo modo
 *    cam.onChange = (m) => avatar.setVisible(m !== 'fp');
 *    // a cada quadro:
 *    cam.pose({ x, y, z, yaw, pitch, eye: 1.2, dist: 6, block }, camera);
 *  - `yaw`: 0 = olhando para +z (sin(yaw), cos(yaw)); `pitch` > 0 olha para cima.
 *  - `block(x0,y0,z0,x1,y1,z1)` (opcional) devolve 0..1 = fração livre do segmento
 *    olho→câmera (colisão: a câmera de 3ª pessoa encosta antes de atravessar parede/árvore).
 *  - Em 1ª pessoa esconda o próprio avatar e mostre o item na mão; em 3ª, mostre o avatar
 *    (no Bloop de papel: PaperChar.setVisible(m !== 'fp')).
 *  Sem DOM fora do botão; sem dependência do jogo.
 * ============================================================ */
import * as THREE from 'three';

export type CamMode = 'fp' | 'tp' | 'front';
export const CAM_MODES: CamMode[] = ['fp', 'tp', 'front'];

export interface CamPoseIn {
  x: number;
  /** chão sob o jogador */
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** altura dos olhos acima do chão (1ª pessoa) */
  eye?: number;
  /** distância da câmera em 3ª pessoa */
  dist?: number;
  /** balanço de passo (só 1ª pessoa) */
  bob?: number;
  /** colisão: fração livre (0..1) do segmento do olho até a câmera */
  block?: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => number;
  /** suavização (s) da câmera de 3ª pessoa; 0 = sem */
  smooth?: number;
  dt?: number;
}

const _t = new THREE.Vector3();
const _l = new THREE.Vector3();

const ICON: Record<CamMode, string> = {
  // olho (1ª), boneco de costas (3ª), boneco de frente (selfie)
  fp: '<svg viewBox="0 0 48 48" width="26" height="26"><path d="M4 24c6-10 14-14 20-14s14 4 20 14c-6 10-14 14-20 14S10 34 4 24z" fill="#fff" stroke="#2a0b5c" stroke-width="3"/><circle cx="24" cy="24" r="7" fill="#3a8aff" stroke="#2a0b5c" stroke-width="3"/></svg>',
  tp: '<svg viewBox="0 0 48 48" width="26" height="26"><circle cx="24" cy="15" r="8" fill="#ffd34a" stroke="#2a0b5c" stroke-width="3"/><path d="M10 42c0-10 6-16 14-16s14 6 14 16z" fill="#ffd34a" stroke="#2a0b5c" stroke-width="3"/><path d="M6 8l6 4-6 4" fill="none" stroke="#2a0b5c" stroke-width="3" stroke-linecap="round"/></svg>',
  front: '<svg viewBox="0 0 48 48" width="26" height="26"><circle cx="24" cy="15" r="8" fill="#ffd34a" stroke="#2a0b5c" stroke-width="3"/><circle cx="21" cy="14" r="1.6" fill="#2a0b5c"/><circle cx="27" cy="14" r="1.6" fill="#2a0b5c"/><path d="M10 42c0-10 6-16 14-16s14 6 14 16z" fill="#ffd34a" stroke="#2a0b5c" stroke-width="3"/></svg>',
};

export class CamView {
  mode: CamMode;
  onChange: ((m: CamMode) => void) | null = null;
  btn: HTMLButtonElement | null = null;
  private key: string;
  private cur = new THREE.Vector3();
  private has = false;

  constructor(game: string, def: CamMode = 'fp') {
    this.key = 'camview:' + game;
    let m: CamMode = def;
    try {
      const v = localStorage.getItem(this.key) as CamMode | null;
      if (v && CAM_MODES.includes(v)) m = v;
    } catch {
      /* */
    }
    this.mode = m;
  }
  get firstPerson(): boolean {
    return this.mode === 'fp';
  }
  set(m: CamMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.has = false;
    try {
      localStorage.setItem(this.key, m);
    } catch {
      /* */
    }
    this.paint();
    this.onChange?.(m);
  }
  cycle(): CamMode {
    this.set(CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length]);
    return this.mode;
  }
  /** botãozinho redondo (ícone do modo ATUAL); `cls` = classe extra do jogo para combinar com o HUD */
  mountButton(parent: HTMLElement, o: { cls?: string; label?: string; onPress?: () => void } = {}): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'camview-btn ' + (o.cls ?? '');
    b.type = 'button';
    if (o.label) b.setAttribute('aria-label', o.label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycle();
      o.onPress?.();
    });
    parent.appendChild(b);
    this.btn = b;
    this.paint();
    return b;
  }
  private paint(): void {
    if (this.btn) {
      this.btn.innerHTML = ICON[this.mode];
      this.btn.dataset.mode = this.mode;
    }
  }

  /** posiciona a câmera conforme o modo. Devolve o ponto olhado (para mira). */
  pose(o: CamPoseIn, cam: THREE.Camera): THREE.Vector3 {
    const eye = o.eye ?? 1.2;
    const ey = o.y + eye + (this.mode === 'fp' ? o.bob ?? 0 : 0);
    const cp = Math.cos(o.pitch);
    const fx = Math.sin(o.yaw) * cp;
    const fz = Math.cos(o.yaw) * cp;
    const fy = Math.sin(o.pitch);
    if (this.mode === 'fp') {
      cam.position.set(o.x, ey, o.z);
      _l.set(o.x + fx, ey + fy, o.z + fz);
      cam.lookAt(_l);
      this.has = false;
      return _l;
    }
    // 3ª pessoa: atrás (ou na frente, olhando para o jogador)
    const d = o.dist ?? 5.5;
    const s = this.mode === 'tp' ? -1 : 1;
    // inclina para cima um pouco além do olhar (vê o chão em volta)
    const pitch = this.mode === 'tp' ? Math.max(-0.6, Math.min(1.1, -o.pitch + 0.35)) : 0.25;
    const hx = Math.sin(o.yaw) * Math.cos(pitch) * d * s;
    const hz = Math.cos(o.yaw) * Math.cos(pitch) * d * s;
    const hy = Math.sin(pitch) * d;
    let k = 1;
    if (o.block) k = Math.max(0.15, Math.min(1, o.block(o.x, ey, o.z, o.x + hx, ey + hy, o.z + hz)));
    _t.set(o.x + hx * k, Math.max(o.y + 0.4, ey + hy * k), o.z + hz * k);
    if (!this.has || !o.smooth) this.cur.copy(_t);
    else this.cur.lerp(_t, Math.min(1, (o.dt ?? 0.016) / o.smooth));
    this.has = true;
    cam.position.copy(this.cur);
    _l.set(o.x, ey - 0.15, o.z);
    cam.lookAt(_l);
    return _l;
  }
}

/** estilo base do botão (o jogo pode sobrescrever com `cls`) */
const CSS = '.camview-btn{width:46px;height:46px;border-radius:50%;border:0;background:linear-gradient(#fff,#e9e0ff);box-shadow:0 3px 0 #2a0b5c,0 5px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;touch-action:none}.camview-btn:active{transform:translateY(2px)}';
if (typeof document !== 'undefined' && !document.getElementById('camview-css')) {
  const st = document.createElement('style');
  st.id = 'camview-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}
