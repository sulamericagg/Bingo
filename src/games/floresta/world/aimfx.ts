/* ============================================================
 *  MUNDO — efeitos da mira no mundo 3D:
 *  - contorno do bloco/célula na mira (linhas escuras finas);
 *  - "fantasma" do bloco que vai ser colocado (cubo translúcido);
 *  - rachaduras em 10 estágios enquanto segura para quebrar
 *    (caixa por cima do bloco; no terreno suave, decalque na superfície);
 *  - item que sai do bloco quebrado, quica no chão e é puxado quando o jogador chega perto.
 *  Tudo barato: 1 geometria de cada, texturas de canvas geradas uma vez.
 * ============================================================ */
import * as THREE from 'three';

const STAGES = 10;

/** atlas 10×1 de rachaduras (desenho próprio: traços a partir do centro, cada estágio soma ao anterior) */
function crackAtlas(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * STAGES;
  c.height = S;
  const x = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // traços de cada estágio (acumulados)
  const segs: [number, number, number, number, number][] = [];
  const grow = (n: number) => {
    for (let i = 0; i < n; i++) {
      const from = segs.length && rnd() < 0.7 ? segs[Math.floor(rnd() * segs.length)] : null;
      const sx = from ? from[2] : S / 2 + (rnd() - 0.5) * 10;
      const sy = from ? from[3] : S / 2 + (rnd() - 0.5) * 10;
      const a = rnd() * Math.PI * 2;
      const l = 6 + rnd() * 12;
      segs.push([sx, sy, sx + Math.cos(a) * l, sy + Math.sin(a) * l, 1.2 + rnd() * 1.6]);
    }
  };
  for (let k = 0; k < STAGES; k++) {
    grow(k === 0 ? 3 : 4 + k);
    x.save();
    x.beginPath();
    x.rect(k * S, 0, S, S);
    x.clip();
    x.translate(k * S, 0);
    x.lineCap = 'round';
    for (const s of segs) {
      x.strokeStyle = 'rgba(255,255,255,.35)';
      x.lineWidth = s[4] + 1.6;
      x.beginPath();
      x.moveTo(s[0] + 0.8, s[1] + 0.8);
      x.lineTo(s[2] + 0.8, s[3] + 0.8);
      x.stroke();
      x.strokeStyle = 'rgba(20,8,30,.92)';
      x.lineWidth = s[4];
      x.beginPath();
      x.moveTo(s[0], s[1]);
      x.lineTo(s[2], s[3]);
      x.stroke();
    }
    // escurece um pouco no fim
    x.fillStyle = `rgba(20,8,30,${0.04 * k})`;
    x.fillRect(0, 0, S, S);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.repeat.set(1 / STAGES, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** item solto no chão (sai do bloco quebrado, quica, e é puxado quando o jogador chega perto) */
interface Drop {
  s: THREE.Sprite;
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** puxado pelo jogador */
  pull: boolean;
  rest: boolean;
  done: () => void;
}

export class AimFx {
  private outline: THREE.LineSegments;
  private ghost: THREE.Mesh;
  private ghostEdge: THREE.LineSegments;
  private crackBox: THREE.Mesh;
  private crackDecal: THREE.Mesh;
  private tex: THREE.CanvasTexture;
  private texD: THREE.CanvasTexture;
  private drops: Drop[] = [];
  /** chão (terreno + blocos) — o motor liga */
  ground: ((x: number, y: number, z: number) => number) | null = null;
  private iconTex = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();

  constructor(private scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1a0b2e, transparent: true, opacity: 0.8, fog: false }));
    this.outline.scale.setScalar(1.006);
    this.outline.renderOrder = 3;
    this.outline.visible = false;
    this.ghost = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x9aff9a, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
    this.ghost.renderOrder = 4;
    this.ghost.visible = false;
    this.ghostEdge = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false, depthTest: false }));
    this.ghost.add(this.ghostEdge);
    this.tex = crackAtlas();
    this.texD = this.tex.clone();
    this.texD.needsUpdate = true;
    const cm = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    this.crackBox = new THREE.Mesh(box, cm(this.tex));
    this.crackBox.scale.setScalar(1.012);
    this.crackBox.renderOrder = 5;
    this.crackBox.visible = false;
    this.crackDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), cm(this.texD));
    this.crackDecal.renderOrder = 5;
    this.crackDecal.visible = false;
    scene.add(this.outline, this.ghost, this.crackBox, this.crackDecal);
  }

  /** contorno da célula (x,y,z = canto mínimo); `through` = desenha por cima do chão (célula do terreno) */
  showOutline(x: number, y: number, z: number, through: boolean): void {
    const o = this.outline;
    o.visible = true;
    o.position.set(x + 0.5, y + 0.5, z + 0.5);
    const m = o.material as THREE.LineBasicMaterial;
    if (m.depthTest === through) {
      m.depthTest = !through;
      m.needsUpdate = true;
    }
    m.opacity = through ? 0.5 : 0.8;
  }
  hideOutline(): void {
    this.outline.visible = false;
  }
  /** cubo-fantasma onde o bloco vai entrar (verde = pode, vermelho = não) */
  showGhost(x: number, y: number, z: number, ok: boolean): void {
    this.ghost.visible = true;
    this.ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x9aff9a : 0xff6a7a);
  }
  hideGhost(): void {
    this.ghost.visible = false;
  }
  /** rachaduras num bloco (0..1); null esconde */
  crackBlock(x: number, y: number, z: number, k: number): void {
    this.crackDecal.visible = false;
    if (k <= 0) {
      this.crackBox.visible = false;
      return;
    }
    this.crackBox.visible = true;
    this.crackBox.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.tex.offset.x = Math.min(STAGES - 1, Math.floor(k * STAGES)) / STAGES;
  }
  /** rachaduras na superfície do terreno suave (ponto + normal) */
  crackSurface(px: number, py: number, pz: number, n: THREE.Vector3, k: number): void {
    this.crackBox.visible = false;
    if (k <= 0) {
      this.crackDecal.visible = false;
      return;
    }
    const d = this.crackDecal;
    d.visible = true;
    d.position.set(px + n.x * 0.03, py + n.y * 0.03, pz + n.z * 0.03);
    d.lookAt(px + n.x, py + n.y, pz + n.z);
    this.texD.offset.x = Math.min(STAGES - 1, Math.floor(k * STAGES)) / STAGES;
  }
  hideCrack(): void {
    this.crackBox.visible = false;
    this.crackDecal.visible = false;
  }
  hideAll(): void {
    this.hideOutline();
    this.hideGhost();
    this.hideCrack();
  }

  /** item sai do bloco (pulinho), cai no chão e fica girando até o jogador chegar perto */
  drop(url: string, x: number, y: number, z: number, done: () => void): void {
    let tex = this.iconTex.get(url);
    if (!tex) {
      tex = this.loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.iconTex.set(url, tex);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.1, fog: true }));
    s.renderOrder = 2;
    s.scale.setScalar(0.34);
    s.position.set(x, y, z);
    this.scene.add(s);
    const a = Math.random() * Math.PI * 2;
    this.drops.push({ s, t: 0, x, y, z, vx: Math.cos(a) * 1.1, vy: 3.2, vz: Math.sin(a) * 1.1, pull: false, rest: false, done });
    // muita coisa no chão: o mais antigo vai direto para a mochila
    if (this.drops.length > 160) this.collect(0);
  }
  private collect(i: number): void {
    const d = this.drops[i];
    this.scene.remove(d.s);
    d.s.material.dispose();
    this.drops.splice(i, 1);
    d.done();
  }
  /** por quadro: (tx,ty,tz) = centro do corpo do jogador (puxa os itens perto) */
  update(dt: number, tx: number, ty: number, tz: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const dx = tx - d.x;
      const dy = ty - d.y;
      const dz = tz - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!d.pull && d.t > 0.35 && dist < 2.6) d.pull = true;
      if (d.pull) {
        if (dist < 0.45 || d.t > 600) {
          this.collect(i);
          continue;
        }
        const sp = Math.min(14, 4 + d.t * 6) * dt;
        const k = Math.min(1, sp / dist);
        d.x += dx * k;
        d.y += dy * k;
        d.z += dz * k;
        if (dist > 4) d.pull = false;
      } else if (!d.rest) {
        d.vy -= 16 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        const g = this.ground ? this.ground(d.x, d.y + 0.6, d.z) + 0.17 : -Infinity;
        if (d.y <= g) {
          d.y = g;
          if (d.vy < -2) d.vy *= -0.3;
          else {
            d.vy = 0;
            d.rest = true;
          }
          d.vx *= 0.5;
          d.vz *= 0.5;
        }
      } else if (this.ground && ((d.t * 10) | 0) % 6 === 0) {
        // chão sumiu embaixo (cavaram): volta a cair
        const g = this.ground(d.x, d.y + 0.3, d.z) + 0.17;
        if (g < d.y - 0.05) d.rest = false;
      }
      // flutua girando de leve sobre o chão (como item largado)
      d.s.position.set(d.x, d.y + (d.rest && !d.pull ? Math.sin(d.t * 3) * 0.05 + 0.05 : 0), d.z);
      d.s.material.rotation = Math.sin(d.t * 2) * 0.25;
    }
  }
  /** quantos itens soltos (depuração) */
  get dropCount(): number {
    return this.drops.length;
  }
  dispose(): void {
    // ao sair, o que estava no chão vai para a mochila (nada se perde)
    while (this.drops.length) this.collect(this.drops.length - 1);
    this.scene.remove(this.outline, this.ghost, this.crackBox, this.crackDecal);
    this.tex.dispose();
    this.texD.dispose();
    for (const t of this.iconTex.values()) t.dispose();
  }
}
