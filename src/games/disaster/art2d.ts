/* ============================================================
 *  ARTE DO 2D (docs/DISASTER-DESIGN.md §10): céu em camadas (degradê, sol/lua, nuvens,
 *  estrelas, tempestade), horizonte com névoa em 3 planos, chão com textura (terra em
 *  camadas, areia, asfalto, neve, bolo, metal), fachadas com padrão (tijolo, tábua, reboco,
 *  doce, metal) e telhas, árvores com volume e cor por desastre. Tudo pré-renderizado por
 *  rodada (padrões e camadas em canvas); nada é criado por quadro.
 * ============================================================ */
import type { MapId, MapTheme } from './scenarios';
import { shade } from './world';

const TAU = Math.PI * 2;

export type GroundStyle = 'soil' | 'sand' | 'city' | 'snow' | 'candy' | 'metal';
export type Facade = 'plaster' | 'brick' | 'wood' | 'candy' | 'metal' | 'adobe';

export interface MapArt {
  ground: GroundStyle;
  facade: Facade;
  /** cor do horizonte enevoado (perspectiva aérea) */
  haze: string;
  /** sol de fim de tarde? (cores quentes) */
  warm: boolean;
}

const ART: Record<MapId, MapArt> = {
  vila: { ground: 'soil', facade: 'plaster', haze: '#cfe8ff', warm: false },
  praia: { ground: 'sand', facade: 'plaster', haze: '#ffe8d0', warm: true },
  cidade: { ground: 'city', facade: 'brick', haze: '#d8e2f4', warm: false },
  floresta: { ground: 'soil', facade: 'wood', haze: '#d8f0e4', warm: false },
  ilha: { ground: 'soil', facade: 'plaster', haze: '#d0f4ff', warm: false },
  montanha: { ground: 'soil', facade: 'wood', haze: '#e4ecff', warm: false },
  parque: { ground: 'soil', facade: 'plaster', haze: '#ffe4f4', warm: false },
  porto: { ground: 'city', facade: 'brick', haze: '#ffe0c8', warm: true },
  deserto: { ground: 'sand', facade: 'adobe', haze: '#ffe8c8', warm: true },
  estacao: { ground: 'metal', facade: 'metal', haze: '#6a5ab8', warm: false },
  polo: { ground: 'snow', facade: 'wood', haze: '#f0f6ff', warm: false },
  fazenda: { ground: 'soil', facade: 'wood', haze: '#e8f4ff', warm: false },
  doces: { ground: 'candy', facade: 'candy', haze: '#fff0fa', warm: false },
};
export function artOf(id: MapId): MapArt {
  return ART[id] ?? ART.vila;
}

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------ padrões ------------------------------ */

/** padrão de sobreposição (linhas escuras/claras semitransparentes) para paredes */
export function facadeOverlay(f: Facade): HTMLCanvasElement {
  const [c, x] = mk(64, 64);
  const r = rnd(7 + f.length);
  if (f === 'brick') {
    x.strokeStyle = 'rgba(60,30,40,.22)';
    x.lineWidth = 1;
    for (let row = 0; row < 8; row++) {
      const y = row * 8 + 0.5;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(64, y);
      x.stroke();
      for (let k = 0; k < 4; k++) {
        const bx = k * 16 + (row % 2 ? 8 : 0) + 0.5;
        x.beginPath();
        x.moveTo(bx, y);
        x.lineTo(bx, y + 8);
        x.stroke();
      }
    }
    for (let i = 0; i < 30; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
      x.fillRect(Math.floor(r() * 4) * 16 + 1, Math.floor(r() * 8) * 8 + 1, 15, 7);
    }
  } else if (f === 'wood') {
    for (let row = 0; row < 6; row++) {
      x.fillStyle = 'rgba(70,40,20,.22)';
      x.fillRect(0, row * 11 + 9, 64, 2);
      x.fillStyle = 'rgba(255,255,255,.1)';
      x.fillRect(0, row * 11, 64, 1.5);
      x.strokeStyle = 'rgba(90,60,30,.1)';
      x.beginPath();
      x.moveTo(0, row * 11 + 4 + r() * 3);
      x.bezierCurveTo(20, row * 11 + 3, 40, row * 11 + 7, 64, row * 11 + 4);
      x.stroke();
    }
  } else if (f === 'candy') {
    for (let i = 0; i < 7; i++) {
      x.fillStyle = ['rgba(255,90,170,.35)', 'rgba(90,200,255,.35)', 'rgba(255,220,60,.4)'][i % 3];
      x.beginPath();
      x.arc(r() * 64, r() * 64, 2.5 + r() * 2.5, 0, TAU);
      x.fill();
    }
  } else if (f === 'metal') {
    x.strokeStyle = 'rgba(40,50,90,.3)';
    x.strokeRect(0.5, 0.5, 31, 31);
    x.strokeRect(32.5, 0.5, 31, 31);
    x.strokeRect(0.5, 32.5, 31, 31);
    x.strokeRect(32.5, 32.5, 31, 31);
    x.fillStyle = 'rgba(40,50,90,.35)';
    for (const [a, b] of [
      [4, 4],
      [28, 4],
      [4, 28],
      [28, 28],
    ])
      for (const [ox, oy] of [
        [0, 0],
        [32, 0],
        [0, 32],
        [32, 32],
      ]) {
        x.beginPath();
        x.arc(a + ox, b + oy, 1.2, 0, TAU);
        x.fill();
      }
  } else {
    // reboco / adobe: manchinhas
    for (let i = 0; i < 70; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.08)';
      x.beginPath();
      x.arc(r() * 64, r() * 64, 0.6 + r() * 2.2, 0, TAU);
      x.fill();
    }
    if (f === 'adobe') {
      x.strokeStyle = 'rgba(120,70,30,.12)';
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.moveTo(r() * 64, r() * 64);
        x.lineTo(r() * 64, r() * 64);
        x.stroke();
      }
    }
  }
  return c;
}

/** telhas (sobreposição): escamas em fileiras */
export function shingleOverlay(): HTMLCanvasElement {
  const [c, x] = mk(32, 16);
  x.strokeStyle = 'rgba(40,10,30,.28)';
  x.lineWidth = 1.2;
  for (let row = 0; row < 2; row++)
    for (let k = -1; k < 3; k++) {
      const cx = k * 12 + (row % 2 ? 6 : 0) + 6;
      x.beginPath();
      x.arc(cx, row * 8, 6, 0.1, Math.PI - 0.1);
      x.stroke();
    }
  x.fillStyle = 'rgba(255,255,255,.12)';
  x.fillRect(0, 0, 32, 1);
  return c;
}

/** solo (corpo do chão abaixo do topo) por estilo */
export function soilTile(st: GroundStyle, m: MapTheme): HTMLCanvasElement {
  const [c, x] = mk(128, 128);
  const r = rnd(31 + st.length);
  const base = st === 'city' ? '#6a6e7c' : st === 'snow' ? '#a8c0dc' : st === 'candy' ? '#7a4426' : st === 'metal' ? '#4a5478' : st === 'sand' ? '#d8a860' : m.ground;
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  if (st === 'candy') {
    // bolo de chocolate com camadas de recheio
    for (const y of [36, 84]) {
      x.fillStyle = '#ffd6ec';
      x.fillRect(0, y, 128, 8);
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillRect(0, y, 128, 2);
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = ['#ff5aa5', '#7ad8ff', '#ffe14d', '#5ee08a'][i % 4];
      x.fillRect(r() * 128, r() * 128, 4, 1.6);
    }
    return c;
  }
  if (st === 'metal') {
    x.strokeStyle = 'rgba(20,24,50,.5)';
    for (let i = 0; i < 4; i++) {
      x.strokeRect(i * 32 + 0.5, 0.5, 32, 64);
      x.strokeRect(i * 32 + 16.5, 64.5, 32, 64);
    }
    x.fillStyle = 'rgba(122,224,255,.35)';
    x.fillRect(0, 62, 128, 2);
    return c;
  }
  // estratos ondulados + pedrinhas
  for (let k = 0; k < 4; k++) {
    x.fillStyle = k % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)';
    x.beginPath();
    const y0 = 14 + k * 30;
    x.moveTo(0, y0);
    for (let i = 0; i <= 8; i++) x.lineTo(i * 16, y0 + Math.sin(i * 1.3 + k) * 4);
    x.lineTo(128, y0 + 12);
    x.lineTo(0, y0 + 12);
    x.fill();
  }
  for (let i = 0; i < 26; i++) {
    const px = r() * 128;
    const py = r() * 128;
    const rr = 1.5 + r() * 3.5;
    x.fillStyle = st === 'city' ? 'rgba(30,30,40,.25)' : st === 'snow' ? 'rgba(255,255,255,.45)' : 'rgba(40,20,10,.25)';
    x.beginPath();
    x.ellipse(px, py + 1, rr, rr * 0.7, 0, 0, TAU);
    x.fill();
    x.fillStyle = st === 'snow' ? 'rgba(255,255,255,.6)' : st === 'city' ? 'rgba(200,200,210,.25)' : 'rgba(255,230,200,.18)';
    x.beginPath();
    x.ellipse(px - 0.5, py, rr * 0.8, rr * 0.5, 0, 0, TAU);
    x.fill();
  }
  if (st === 'soil')
    for (let i = 0; i < 6; i++) {
      // raízes finas
      x.strokeStyle = 'rgba(60,30,10,.25)';
      x.beginPath();
      const sx = r() * 128;
      x.moveTo(sx, 0);
      x.quadraticCurveTo(sx + 8, 10, sx + (r() - 0.5) * 20, 18 + r() * 12);
      x.stroke();
    }
  return c;
}

/** faixa do topo do chão (grama com tufos / areia / calçada / neve / glacê / metal), 128×24 */
export function topStrip(st: GroundStyle, m: MapTheme): HTMLCanvasElement {
  const [c, x] = mk(128, 28);
  const r = rnd(11 + st.length);
  if (st === 'city') {
    x.fillStyle = '#c8ccd8';
    x.fillRect(0, 4, 128, 10);
    x.fillStyle = '#9aa0b2';
    for (let i = 0; i < 8; i++) x.fillRect(i * 16, 4, 1, 10);
    x.fillStyle = '#e8ecf4';
    x.fillRect(0, 4, 128, 2);
    x.fillStyle = '#4a4e5c';
    x.fillRect(0, 14, 128, 14);
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.fillRect(10, 20, 30, 2);
    x.fillRect(74, 20, 30, 2);
    return c;
  }
  if (st === 'metal') {
    x.fillStyle = '#9aa8d6';
    x.fillRect(0, 4, 128, 8);
    x.fillStyle = '#7ae0ff';
    x.fillRect(0, 10, 128, 2);
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.fillRect(0, 4, 128, 1.5);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = '#ffe14d';
      x.fillRect(i * 32 + 14, 6, 4, 3);
    }
    return c;
  }
  const top = st === 'sand' ? '#ffe39a' : st === 'snow' ? '#ffffff' : st === 'candy' ? '#ff9ad5' : m.groundTop;
  x.fillStyle = shade(top, -0.18);
  x.beginPath();
  x.moveTo(0, 4);
  for (let i = 0; i <= 16; i++) x.lineTo(i * 8, 12 + (i % 2) * 3 + r() * 3);
  x.lineTo(128, 4);
  x.fill();
  x.fillStyle = top;
  x.fillRect(0, 4, 128, 7);
  if (st === 'soil') {
    // tufos de grama na borda de cima
    for (let i = 0; i < 46; i++) {
      const gx = r() * 128;
      const h = 3 + r() * 6;
      x.fillStyle = r() < 0.5 ? shade(top, 0.12) : shade(top, -0.1);
      x.beginPath();
      x.moveTo(gx - 1.5, 6);
      x.lineTo(gx + (r() - 0.5) * 3, 6 - h);
      x.lineTo(gx + 1.5, 6);
      x.fill();
    }
    for (let i = 0; i < 5; i++) {
      x.fillStyle = ['#ffffff', '#ffe14d', '#ff7ac8'][i % 3];
      x.beginPath();
      x.arc(r() * 128, 3 + r() * 3, 1.3, 0, TAU);
      x.fill();
    }
  } else if (st === 'candy') {
    // glacê escorrendo + granulado
    x.fillStyle = '#fff3fb';
    for (let i = 0; i < 9; i++) {
      const gx = i * 15 + r() * 6;
      x.beginPath();
      x.ellipse(gx, 11, 3.5, 4 + r() * 5, 0, 0, TAU);
      x.fill();
    }
    x.fillStyle = '#fff3fb';
    x.fillRect(0, 4, 128, 5);
    for (let i = 0; i < 24; i++) {
      x.fillStyle = ['#ff5aa5', '#7ad8ff', '#ffe14d', '#5ee08a'][i % 4];
      x.fillRect(r() * 128, 4 + r() * 4, 3, 1.2);
    }
  } else if (st === 'snow') {
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.ellipse(r() * 128, 6, 6 + r() * 6, 3 + r() * 2, 0, 0, TAU);
      x.fill();
    }
    x.fillStyle = 'rgba(160,200,255,.35)';
    x.fillRect(0, 10, 128, 2);
  } else {
    // areia: ondinhas
    x.strokeStyle = 'rgba(190,130,60,.35)';
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      const gx = r() * 128;
      x.arc(gx, 9, 5, Math.PI * 1.1, Math.PI * 1.9);
      x.stroke();
    }
  }
  x.fillStyle = 'rgba(255,255,255,.35)';
  x.fillRect(0, 4, 128, 1.2);
  return c;
}

/* ------------------------------ céu ------------------------------ */

/** degradê do céu (1 × 256) com halo do sol pintado na hora */
export function skyStrip(cols: [string, string, string], storm: boolean, night: boolean): HTMLCanvasElement {
  const [c, x] = mk(1, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  if (night) {
    g.addColorStop(0, '#070a24');
    g.addColorStop(0.55, '#16204e');
    g.addColorStop(1, '#3a3a78');
  } else if (storm) {
    g.addColorStop(0, '#2a3048');
    g.addColorStop(0.6, '#4a5470');
    g.addColorStop(1, '#8a90a8');
  } else {
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.6, cols[1]);
    g.addColorStop(1, cols[2]);
  }
  x.fillStyle = g;
  x.fillRect(0, 0, 1, 256);
  return c;
}

/** faixa de nuvens (tileável) — fofas, com sombra embaixo; tempestade: escuras e cheias */
export function cloudStrip(storm: boolean, seed: number): HTMLCanvasElement {
  const [c, x] = mk(1024, 220);
  const r = rnd(seed);
  const n = storm ? 26 : 9;
  for (let i = 0; i < n; i++) {
    const cx = r() * 1024;
    const cy = storm ? 30 + r() * 90 : 40 + r() * 110;
    const w = storm ? 160 + r() * 200 : 80 + r() * 140;
    const h = w * (storm ? 0.32 : 0.38);
    for (const ox of [-1024, 0, 1024]) {
      if (cx + ox + w < 0 || cx + ox - w > 1024) continue;
      // corpo: vários círculos
      const lobes = 6;
      x.fillStyle = storm ? 'rgba(40,44,66,.85)' : 'rgba(160,190,230,.45)';
      x.beginPath();
      for (let k = 0; k < lobes; k++) {
        const lx = cx + ox - w / 2 + (k + 0.5) * (w / lobes);
        const lr = h * (0.5 + 0.5 * Math.sin((k / (lobes - 1)) * Math.PI)) + 4;
        x.moveTo(lx + lr, cy + 6);
        x.arc(lx, cy + 6, lr, 0, TAU);
      }
      x.fill();
      x.fillStyle = storm ? 'rgba(90,96,124,.9)' : 'rgba(255,255,255,.95)';
      x.beginPath();
      for (let k = 0; k < lobes; k++) {
        const lx = cx + ox - w / 2 + (k + 0.5) * (w / lobes);
        const lr = h * (0.5 + 0.5 * Math.sin((k / (lobes - 1)) * Math.PI));
        x.moveTo(lx + lr, cy);
        x.arc(lx, cy, lr, 0, TAU);
      }
      x.fill();
      x.fillStyle = storm ? 'rgba(140,146,170,.4)' : 'rgba(255,255,255,.9)';
      x.beginPath();
      x.arc(cx + ox - w * 0.12, cy - h * 0.35, h * 0.35, 0, TAU);
      x.fill();
    }
  }
  return c;
}

/** estrelas (tileável) */
export function starStrip(seed: number): HTMLCanvasElement {
  const [c, x] = mk(512, 220);
  const r = rnd(seed);
  for (let i = 0; i < 90; i++) {
    const s = r() < 0.1 ? 2 : 1;
    x.fillStyle = `rgba(255,255,240,${0.5 + r() * 0.5})`;
    x.fillRect(r() * 512, r() * 220, s, s);
  }
  return c;
}

/* ------------------------------ grade por desastre ------------------------------ */

/** [cor do topo, cor de baixo, alfa] para 'soft-light' e uma tinta multiplicativa leve */
export function gradeFor(active: Set<string>, night: boolean): { top: string; bottom: string; tint: string; a: number } | null {
  const has = (d: string) => active.has(d);
  if (has('vulcao') || has('incendio')) return { top: 'rgba(120,20,0,.6)', bottom: 'rgba(255,140,40,.55)', tint: 'rgba(255,90,20,.10)', a: 1 };
  if (has('calor')) return { top: 'rgba(255,200,80,.5)', bottom: 'rgba(255,170,60,.4)', tint: 'rgba(255,190,60,.08)', a: 1 };
  if (has('acido')) return { top: 'rgba(30,80,20,.5)', bottom: 'rgba(140,255,80,.4)', tint: 'rgba(120,255,60,.07)', a: 1 };
  if (has('nevasca') || has('avalanche')) return { top: 'rgba(170,210,255,.5)', bottom: 'rgba(220,240,255,.45)', tint: 'rgba(200,230,255,.10)', a: 1 };
  if (has('fantasma')) return { top: 'rgba(60,40,120,.6)', bottom: 'rgba(160,150,220,.45)', tint: 'rgba(90,70,160,.10)', a: 1 };
  if (has('buraco') || has('laser') || has('abducao') || has('gravidade')) return { top: 'rgba(80,30,160,.55)', bottom: 'rgba(255,120,220,.35)', tint: 'rgba(140,80,255,.07)', a: 1 };
  if (has('raios') || has('tornado') || has('enchente') || has('tsunami')) return { top: 'rgba(10,20,60,.6)', bottom: 'rgba(120,160,220,.35)', tint: night ? 'rgba(10,20,60,.1)' : 'rgba(20,40,90,.08)', a: 1 };
  if (has('areia')) return { top: 'rgba(140,80,20,.5)', bottom: 'rgba(255,200,120,.4)', tint: 'rgba(220,150,70,.08)', a: 1 };
  return null;
}
