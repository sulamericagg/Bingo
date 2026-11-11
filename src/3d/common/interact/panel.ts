/* ============================================================
 *  INTERFACE DIEGÉTICA (kit de interação 3D): textos e pedidos em
 *  objetos do mundo, não em painéis de HUD.
 *   - CanvasPanel: plano com textura de canvas (tela na parede, nota, placa).
 *   - TicketPrinter: impressora de comandas — o papel SAI da fenda quando
 *     chega um pedido (com som), e fica pendurado lá.
 *   - sticker(): adesivo com ícone (portas de geladeira, dispensers).
 * ============================================================ */
import * as THREE from 'three';
import { Spring } from './controls';

export class CanvasPanel {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
  constructor(
    readonly w: number,
    readonly h: number,
    px: number,
    /** true = brilha (tela); false = recebe luz (papel) */
    glow = true,
  ) {
    this.cv = document.createElement('canvas');
    this.cv.width = px;
    this.cv.height = Math.max(8, Math.round((px * h) / w));
    this.ctx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = glow ? new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }) : new THREE.MeshLambertMaterial({ map: this.tex });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }
  /** redesenha (px do canvas) e envia para a GPU */
  draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    fn(this.ctx, this.cv.width, this.cv.height);
    this.tex.needsUpdate = true;
  }
  dispose(): void {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

/** tela de parede com moldura (pedidos) */
export function wallScreen(w: number, h: number, px = 1024, frame = '#2a2238'): { group: THREE.Group; panel: CanvasPanel; dispose(): void } {
  const g = new THREE.Group();
  const panel = new CanvasPanel(w, h, px, true);
  const fg = new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05);
  const fm = new THREE.MeshLambertMaterial({ color: frame });
  const fr = new THREE.Mesh(fg, fm);
  fr.position.z = -0.026;
  panel.mesh.position.z = 0.002;
  g.add(fr, panel.mesh);
  return {
    group: g,
    panel,
    dispose() {
      panel.dispose();
      fg.dispose();
      fm.dispose();
      g.parent?.remove(g);
    },
  };
}

/** impressora de comandas: caixa + fenda + papel que sai animado */
export class TicketPrinter {
  readonly group = new THREE.Group();
  readonly paper: CanvasPanel;
  readonly box = new THREE.Box3();
  private feed = new Spring(90, 14);
  private out = 0;
  private body: THREE.Mesh;
  private owned: { dispose(): void }[] = [];
  /** chamado ao começar a imprimir (som "brrrt") */
  onPrint?: () => void;
  constructor(
    readonly paperW = 0.2,
    readonly paperH = 0.32,
    color = '#e9ecf2',
  ) {
    const bg = new THREE.BoxGeometry(paperW + 0.08, 0.12, 0.14);
    const bm = new THREE.MeshLambertMaterial({ color });
    this.body = new THREE.Mesh(bg, bm);
    this.body.position.set(0, 0, 0.07);
    const sg = new THREE.BoxGeometry(paperW + 0.01, 0.012, 0.02);
    const sm = new THREE.MeshBasicMaterial({ color: '#1a1622' });
    const slot = new THREE.Mesh(sg, sm);
    slot.position.set(0, -0.055, 0.135);
    const lg = new THREE.SphereGeometry(0.012, 8, 6);
    const lm = new THREE.MeshBasicMaterial({ color: '#3effa0', toneMapped: false });
    const led = new THREE.Mesh(lg, lm);
    led.position.set(paperW / 2 + 0.015, 0.03, 0.142);
    this.owned.push(bg, bm, sg, sm, lg, lm);
    this.paper = new CanvasPanel(paperW, paperH, 256, false);
    (this.paper.mesh.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    this.paper.mesh.position.set(0, -0.06, 0.13);
    // o pivô do papel é a borda de cima: desloca a geometria
    this.paper.mesh.geometry.translate(0, -paperH / 2, 0);
    this.paper.mesh.scale.y = 0.001;
    this.group.add(this.body, slot, led, this.paper.mesh);
  }
  /** imprime uma comanda nova (desenho no canvas do papel) */
  print(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.paper.draw(fn);
    this.out = 1;
    this.feed.x = 0;
    this.feed.v = 0;
    this.onPrint?.();
  }
  /** só atualiza o desenho (sem imprimir de novo) */
  redraw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.paper.draw(fn);
  }
  /** recolhe o papel (sem pedidos) */
  clear(): void {
    this.out = 0;
  }
  update(dt: number, time: number): void {
    const k = this.feed.step(this.out, dt * (this.out ? 0.5 : 1.5));
    const m = this.paper.mesh;
    m.scale.y = Math.max(0.001, k);
    m.rotation.x = 0.08 + Math.sin(time * 1.7) * 0.03 * k; // balança de leve
    m.visible = k > 0.01;
  }
  refreshBox(): void {
    this.group.updateMatrixWorld(true);
    this.box.setFromObject(this.group);
  }
  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.paper.dispose();
    this.group.parent?.remove(this.group);
  }
}

const stickers = new Map<string, THREE.MeshBasicMaterial>();
const stickerGeo = new Map<string, THREE.PlaneGeometry>();
/**
 * Adesivo redondo/retangular com desenho (ícone do conteúdo de um dispenser, por ex.).
 * Cache por `key`: o mesmo adesivo em várias portas usa a mesma textura.
 */
export function sticker(key: string, w: number, h: number, px: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Mesh {
  let m = stickers.get(key);
  if (!m) {
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = Math.round((px * h) / w);
    draw(cv.getContext('2d')!, cv.width, cv.height);
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: tx, transparent: true, alphaTest: 0.05, toneMapped: false });
    stickers.set(key, m);
  }
  const gk = w + 'x' + h;
  let g = stickerGeo.get(gk);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    stickerGeo.set(gk, g);
  }
  return new THREE.Mesh(g, m);
}
export function disposeStickers(): void {
  for (const m of stickers.values()) {
    m.map?.dispose();
    m.dispose();
  }
  for (const g of stickerGeo.values()) g.dispose();
  stickers.clear();
  stickerGeo.clear();
}
