/* ============================================================
 *  MUNDO — capas desenhadas dos cartões do navegador de servidores
 *  (quando o servidor ainda não tem foto do anfitrião). Canvas 2D,
 *  320×180, cacheadas por tipo. Blocos "voxel" simples, cores do jogo.
 * ============================================================ */

const cache = new Map<string, string>();

type Ctx = CanvasRenderingContext2D;
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/** bloco com topo claro e lado escuro (meio isométrico) */
function block(x: Ctx, px: number, py: number, s: number, c: string): void {
  x.fillStyle = shade(c, 0.72);
  x.fillRect(px, py, s, s);
  x.fillStyle = c;
  x.fillRect(px, py, s, s * 0.34);
  x.fillStyle = 'rgba(255,255,255,.22)';
  x.fillRect(px, py, s, 2);
  x.strokeStyle = 'rgba(0,0,0,.18)';
  x.lineWidth = 1;
  x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}
function sky(x: Ctx, a: string, b: string): void {
  const g = x.createLinearGradient(0, 0, 0, 180);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  x.fillStyle = g;
  x.fillRect(0, 0, 320, 180);
}
function cloud(x: Ctx, cx: number, cy: number, s: number): void {
  x.fillStyle = 'rgba(255,255,255,.85)';
  for (const [dx, dy, r] of [
    [0, 0, 1],
    [0.9, 0.15, 0.8],
    [-0.9, 0.2, 0.75],
    [0.3, -0.45, 0.7],
  ])
    x.beginPath(), x.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2), x.fill();
}
function sun(x: Ctx, cx: number, cy: number): void {
  const g = x.createRadialGradient(cx, cy, 2, cx, cy, 30);
  g.addColorStop(0, '#fff8c0');
  g.addColorStop(0.5, '#ffd34a');
  g.addColorStop(1, 'rgba(255,211,74,0)');
  x.fillStyle = g;
  x.fillRect(cx - 30, cy - 30, 60, 60);
}
function tree(x: Ctx, px: number, py: number, s: number): void {
  for (let i = 0; i < 3; i++) block(x, px, py - (i + 1) * s, s, '#8a5a2e');
  for (let dx = -1; dx <= 1; dx++) for (let dy = 3; dy <= 4; dy++) block(x, px + dx * s, py - (dy + 1) * s, s, '#3ea84a');
  block(x, px, py - 6 * s, s, '#4cc25a');
}
function ground(x: Ctx, r: () => number, top: string, y0: number, s = 16, rough = 2): void {
  for (let c = 0; c * s < 320; c++) {
    const h = y0 - Math.floor(r() * rough) * s;
    block(x, c * s, h, s, top);
    for (let y = h + s; y < 180; y += s) block(x, c * s, y, s, y > h + s * 2 ? '#8b8f9c' : '#9a6a3c');
  }
}
function bloop(x: Ctx, cx: number, cy: number, r: number, col: string): void {
  x.fillStyle = col;
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#fff';
  for (const d of [-0.35, 0.35]) x.beginPath(), x.ellipse(cx + d * r, cy - 0.15 * r, r * 0.24, r * 0.3, 0, 0, Math.PI * 2), x.fill();
  x.fillStyle = '#2a0b5c';
  for (const d of [-0.32, 0.38]) x.beginPath(), x.arc(cx + d * r, cy - 0.12 * r, r * 0.12, 0, Math.PI * 2), x.fill();
}

const DRAW: Record<string, (x: Ctx, r: () => number) => void> = {
  sobrev(x, r) {
    sky(x, '#7fd0ff', '#d6f3ff');
    sun(x, 262, 38);
    cloud(x, 70, 40, 14);
    cloud(x, 190, 28, 10);
    ground(x, r, '#5cc94e', 132);
    tree(x, 48, 116, 12);
    tree(x, 230, 116, 12);
    bloop(x, 150, 104, 16, '#ff8fd0');
    // fogueira
    block(x, 186, 108, 10, '#8a5a2e');
    x.fillStyle = '#ffb02e';
    x.beginPath(), x.moveTo(184, 108), x.lineTo(191, 92), x.lineTo(198, 108), x.fill();
  },
  pvp(x, r) {
    sky(x, '#5c3ad0', '#ff8fd0');
    cloud(x, 40, 150, 18);
    cloud(x, 280, 160, 22);
    const cols = ['#ffd34a', '#ff9a2e', '#ff4f6a', '#ff5cc8', '#8a5cff', '#5ec8ff'];
    for (let i = cols.length - 1; i >= 0; i--) {
      x.fillStyle = shade(cols[i], 0.7);
      x.beginPath(), x.ellipse(160, 128, 30 + i * 18, 10 + i * 6, 0, 0, Math.PI * 2), x.fill();
      x.fillStyle = cols[i];
      x.beginPath(), x.ellipse(160, 122, 30 + i * 18, 10 + i * 6, 0, 0, Math.PI * 2), x.fill();
    }
    bloop(x, 122, 104, 15, '#5ec8ff');
    bloop(x, 200, 100, 15, '#ffd34a');
    // "pou!" de empurrão
    x.fillStyle = '#fff';
    x.font = '900 22px system-ui,sans-serif';
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 4;
    x.strokeText('POU!', 140, 60), x.fillText('POU!', 140, 60);
    void r;
  },
  ceu(x, r) {
    sky(x, '#9be7ff', '#fff3c4');
    sun(x, 60, 40);
    for (const [cx, cy, w] of [
      [60, 120, 5],
      [170, 86, 6],
      [270, 128, 4],
    ]) {
      for (let i = 0; i < w; i++) block(x, cx + (i - w / 2) * 12, cy, 12, '#5cc94e');
      for (let i = 1; i < w - 1; i++) block(x, cx + (i - w / 2) * 12, cy + 12, 12, '#9a6a3c');
      block(x, cx - 6, cy + 24, 12, '#8b8f9c');
    }
    tree(x, 170, 86, 9);
    cloud(x, 230, 50, 12);
    bloop(x, 64, 106, 12, '#ff8fd0');
    void r;
  },
  obby(x, r) {
    sky(x, '#ffb36b', '#ffe6a8');
    cloud(x, 250, 40, 13);
    const cols = ['#ff4f6a', '#ff9a2e', '#ffd34a', '#3ee07a', '#5ec8ff', '#8a5cff'];
    let px = 10;
    let py = 150;
    for (let i = 0; i < 8; i++) {
      const c = cols[i % cols.length];
      block(x, px, py, 14, c), block(x, px + 14, py, 14, c);
      px += 34 + r() * 8;
      py -= 10 + r() * 6;
    }
    for (let i = 0; i < 3; i++) block(x, px + i * 14, py, 14, '#ffcf2e');
    bloop(x, 52, 128, 11, '#5ec8ff');
  },
  spleef(x, r) {
    sky(x, '#bfe6ff', '#eaf6ff');
    for (const [y0, edge] of [
      [72, '#5ec8ff'],
      [132, '#3a5ad0'],
    ] as [number, string][])
      for (let c = 2; c < 18; c++) {
        if (r() < 0.18) continue;
        block(x, c * 16, y0, 16, c === 2 || c === 17 ? edge : '#ffffff');
      }
    bloop(x, 120, 56, 13, '#ffd34a');
    bloop(x, 210, 56, 13, '#ff8fd0');
    x.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) x.fillRect(r() * 320, r() * 180, 2, 2);
  },
  esconde(x, r) {
    sky(x, '#1d2a6a', '#5a4fb0');
    x.fillStyle = '#fff8c0';
    x.beginPath(), x.arc(270, 34, 16, 0, Math.PI * 2), x.fill();
    ground(x, r, '#3f9a4a', 138);
    tree(x, 40, 122, 12);
    tree(x, 120, 122, 12);
    tree(x, 260, 122, 12);
    // olhinhos escondidos na moita
    for (const [cx, cy] of [
      [178, 112],
      [214, 116],
    ]) {
      x.fillStyle = '#2f7a3a';
      x.beginPath(), x.arc(cx, cy + 6, 16, 0, Math.PI * 2), x.fill();
      x.fillStyle = '#fff';
      x.beginPath(), x.arc(cx - 5, cy, 4, 0, Math.PI * 2), x.arc(cx + 5, cy, 4, 0, Math.PI * 2), x.fill();
      x.fillStyle = '#2a0b5c';
      x.beginPath(), x.arc(cx - 5, cy, 2, 0, Math.PI * 2), x.arc(cx + 5, cy, 2, 0, Math.PI * 2), x.fill();
    }
  },
  build(x, r) {
    sky(x, '#8ad8ff', '#e0f7ff');
    cloud(x, 60, 36, 12);
    ground(x, r, '#5cc94e', 146, 16, 1);
    // casinha de blocos
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 6; xx++) if (!(yy < 2 && xx === 2)) block(x, 110 + xx * 14, 132 - yy * 14, 14, yy === 3 ? '#ff4f6a' : '#f2d28a');
    for (let xx = 1; xx < 5; xx++) block(x, 110 + xx * 14, 132 - 4 * 14, 14, '#ff4f6a');
    block(x, 110 + 2.5 * 14, 132 - 5 * 14, 14, '#ff4f6a');
    // bloco flutuando sendo colocado
    block(x, 236, 76, 18, '#5ec8ff');
    x.strokeStyle = '#fff';
    x.setLineDash([4, 4]);
    x.strokeRect(236, 98, 18, 18);
    x.setLineDash([]);
    bloop(x, 60, 128, 13, '#ffd34a');
  },
  studio(x, r) {
    sky(x, '#5a3ad0', '#2a1658');
    x.strokeStyle = 'rgba(255,255,255,.14)';
    x.lineWidth = 1;
    for (let i = -10; i <= 10; i++) x.beginPath(), x.moveTo(160 + i * 16, 110), x.lineTo(160 + i * 40, 180), x.stroke();
    for (let k = 0; k < 5; k++) x.beginPath(), x.moveTo(0, 110 + k * k * 3.4), x.lineTo(320, 110 + k * k * 3.4), x.stroke();
    const cols = ['#ff5cc8', '#ffd34a', '#5ef0ff', '#3ee07a'];
    for (let i = 0; i < 9; i++) block(x, 40 + r() * 230, 30 + r() * 80, 14 + r() * 12, cols[i % cols.length]);
    bloop(x, 160, 128, 15, '#ff8fd0');
  },
};

/** capa de um tipo ('sobrev', 'pvp', 'ceu', 'obby', 'spleef', 'esconde', 'build', 'studio', 'user') */
export function coverFor(kind: string, seed = 1): string {
  const k = DRAW[kind] ? kind : kind === 'user' ? 'sobrev' : 'studio';
  const key = k + ':' + seed;
  let u = cache.get(key);
  if (u) return u;
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 180;
  const x = cv.getContext('2d');
  if (!x) return '';
  DRAW[k](x, rng(seed * 7919 + k.length));
  try {
    u = cv.toDataURL('image/jpeg', 0.8);
  } catch {
    u = '';
  }
  cache.set(key, u);
  return u;
}
