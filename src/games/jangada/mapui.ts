/* ============================================================
 *  JANGADA BLOOP — bússola (topo) e mapa do mar.
 *  Bússola: N/L/S/O + marcadores (casa, ilhas descobertas, baús de
 *  resgate, destino) com a distância do destino.
 *  Mapa: a jangada no meio, anéis de perigo (perto/meio/longe), ilhas
 *  descobertas com o ícone do bioma, distância e perigo (barbatanas),
 *  você, barcos e baús boiando. Toque numa ilha = destino na bússola.
 * ============================================================ */
import { t } from '../../i18n';
import { BIOMES, RING, isleName, type IsleSpec } from './biomes';
import { jIcon } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export interface Marker {
  x: number;
  z: number;
  icon: string;
  /** destaque (destino) */
  main?: boolean;
}
/** rumo (mesma convenção do yaw do jogador: 0 = -z, cresce para a esquerda) */
export const bearing = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));
const ang = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Compass {
  readonly el: HTMLDivElement;
  private strip: HTMLDivElement;
  private dist: HTMLElement;
  private pool: HTMLDivElement[] = [];
  private key = '';
  constructor(parent: HTMLElement, onMap: () => void) {
    const d = document.createElement('div');
    d.className = 'jg-compass jg-pe';
    d.innerHTML = `<div class="strip"></div><b class="dist"></b>`;
    parent.appendChild(d);
    this.el = d;
    this.strip = d.querySelector('.strip')!;
    this.dist = d.querySelector('.dist')!;
    d.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onMap();
    });
  }
  update(px: number, pz: number, yaw: number, marks: Marker[]): void {
    const W = this.strip.clientWidth || 220;
    const fov = 1.9;
    const items: [number, string, string][] = [];
    const card: [number, string][] = [
      [0, t('jangada.dir.n', 'N')],
      [-Math.PI / 2, t('jangada.dir.e', 'L')],
      [Math.PI, t('jangada.dir.s', 'S')],
      [Math.PI / 2, t('jangada.dir.w', 'O')],
    ];
    for (const [b, l] of card) {
      const a = ang(yaw, b);
      if (Math.abs(a) < fov / 2) items.push([W / 2 - (a / fov) * W, 'c', l]);
    }
    let dist = '';
    for (const m of marks) {
      const b = bearing(px, pz, m.x, m.z);
      let a = ang(yaw, b);
      a = Math.max(-fov / 2, Math.min(fov / 2, a));
      items.push([W / 2 - (a / fov) * W, m.main ? 'm main' : 'm', m.icon]);
      if (m.main) dist = `${Math.round(Math.hypot(m.x - px, m.z - pz))} m`;
    }
    const k = items.map((i) => `${Math.round(i[0] / 2)}${i[1]}${i[2]}`).join('|') + dist;
    if (k === this.key) return;
    this.key = k;
    while (this.pool.length < items.length) {
      const e = document.createElement('div');
      this.strip.appendChild(e);
      this.pool.push(e);
    }
    this.pool.forEach((e, i) => {
      const it = items[i];
      if (!it) {
        e.style.display = 'none';
        return;
      }
      e.style.display = '';
      e.className = it[1];
      e.style.transform = `translateX(${it[0].toFixed(0)}px)`;
      const html = it[1] === 'c' ? esc(it[2]) : jIcon(it[2], it[1].includes('main') ? 24 : 18);
      if (e.dataset.h !== html) {
        e.dataset.h = html;
        e.innerHTML = html;
      }
    });
    this.dist.textContent = dist;
    this.dist.style.display = dist ? '' : 'none';
  }
  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }
}

export interface MapData {
  isles: IsleSpec[];
  known: Set<number>;
  px: number;
  pz: number;
  yaw: number;
  boats: [number, number][];
  chests: [number, number][];
  target: number;
}
/** painel do mapa (HTML) */
export function mapHtml(d: MapData, size: number): string {
  const R = RING.far[1] + 60;
  const s = size / 2;
  // escala radial com raiz: o centro (ilhas perto) fica mais espaçado
  const P = (x: number, z: number) => {
    const d = Math.hypot(x, z);
    const k = d > 0.01 ? Math.sqrt(Math.min(1, d / R)) / (d / R) : 1;
    return [s + (x / R) * s * k * 0.94, s + (z / R) * s * k * 0.94];
  };
  const rr = (r: number) => Math.sqrt(r / R) * size * 0.94;
  const rings = [RING.near[1] + 30, RING.mid[1] + 40, RING.far[1] + 40]
    .map((r, i) => `<div class="ring r${i}" style="width:${rr(r).toFixed(0)}px;height:${rr(r).toFixed(0)}px"></div>`)
    .join('');
  const isl = d.isles
    .map((i) => {
      const [x, y] = P(i.x, i.z);
      const B = BIOMES[i.biome];
      if (!d.known.has(i.id)) return `<div class="isl unk" style="left:${x}px;top:${y}px">?</div>`;
      const dist = Math.round(Math.hypot(i.x - d.px, i.z - d.pz));
      const danger = Math.min(4, B.tier);
      const on = d.target === i.id;
      return `<button class="isl${on ? ' on' : ''}" data-i="${i.id}" style="left:${x}px;top:${y}px" aria-label="${esc(isleName(i))}">${jIcon(B.icon, on ? 34 : 28)}<span>${on ? esc(isleName(i)) : ''}<em>${dist} m ${'<i class="fin"></i>'.repeat(danger)}</em></span></button>`;
    })
    .join('');
  const [mx, my] = P(d.px, d.pz);
  const me = `<div class="me" style="left:${mx}px;top:${my}px;transform:translate(-50%,-50%) rotate(${(-d.yaw * 180) / Math.PI}deg)">▲</div>`;
  const home = `<div class="home" style="left:${s}px;top:${s}px">${jIcon('found', 26)}</div>`;
  const boats = d.boats.map(([x, z]) => P(x, z)).map(([x, y]) => `<div class="pin" style="left:${x}px;top:${y}px">${jIcon('canoe', 18)}</div>`).join('');
  const ch = d.chests.map(([x, z]) => P(x, z)).map(([x, y]) => `<div class="pin" style="left:${x}px;top:${y}px">${jIcon('beacon', 20)}</div>`).join('');
  return `<div class="jg-map" style="width:${size}px;height:${size}px">${rings}${home}${isl}${boats}${ch}${me}</div>`;
}
export const mapLegend = () =>
  `<div class="jg-maplg"><span>${jIcon('found', 18)}${esc(t('jangada.map.home', 'Casa'))}</span><span><i class="fin"></i>${esc(t('jangada.map.danger', 'Perigo'))}</span><span>${jIcon('beacon', 18)}${esc(t('jangada.map.chest', 'Baú de resgate'))}</span><small>${esc(t('jangada.map.tip', 'Toque numa ilha para seguir na bússola'))}</small></div>`;
