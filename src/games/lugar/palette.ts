/* BLOOP NO LUGAR — cores das regiões (com nome, para as dicas) e padrões para daltonismo. */
import { t } from '../../i18n';

export interface RegionColor {
  fill: string;
  /** tom mais escuro (sombra interna, X) */
  deep: string;
  name: () => string;
}

/** 12 cores bem separadas em matiz E em claridade (ajuda quem não distingue vermelho/verde). */
export const REGION_COLORS: RegionColor[] = [
  { fill: '#ff9ec4', deep: '#d4568c', name: () => t('lugar.c.rosa', 'Rosa') },
  { fill: '#8fd6ff', deep: '#3f8fd1', name: () => t('lugar.c.azul', 'Azul') },
  { fill: '#ffe066', deep: '#d1a514', name: () => t('lugar.c.amarelo', 'Amarela') },
  { fill: '#9be8b4', deep: '#3fa86a', name: () => t('lugar.c.menta', 'Menta') },
  { fill: '#c6a8ff', deep: '#7a52d6', name: () => t('lugar.c.lilas', 'Lilás') },
  { fill: '#ffb47a', deep: '#d6702c', name: () => t('lugar.c.laranja', 'Laranja') },
  { fill: '#6ee0d6', deep: '#1f9a90', name: () => t('lugar.c.turquesa', 'Turquesa') },
  { fill: '#ff7b7b', deep: '#c93a3a', name: () => t('lugar.c.coral', 'Coral') },
  { fill: '#d8f07a', deep: '#8fae22', name: () => t('lugar.c.limao', 'Limão') },
  { fill: '#e7c6a2', deep: '#a37a50', name: () => t('lugar.c.areia', 'Areia') },
  { fill: '#f0a8ec', deep: '#b350ad', name: () => t('lugar.c.chiclete', 'Chiclete') },
  { fill: '#b4c0dc', deep: '#62739c', name: () => t('lugar.c.nuvem', 'Nuvem') },
];

/** Padrão desenhado em um ladrilho s×s (tinta escura translúcida); cada região tem um. */
export function drawPattern(x: CanvasRenderingContext2D, id: number, s: number, ink: string): void {
  x.strokeStyle = ink;
  x.fillStyle = ink;
  x.lineWidth = Math.max(1, s * 0.07);
  x.lineCap = 'round';
  const h = s / 2;
  const line = (a: number, b: number, c: number, d: number) => {
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(c, d);
    x.stroke();
  };
  switch (id % 12) {
    case 0: // bolinhas
      for (const [px, py] of [[s * 0.25, s * 0.25], [s * 0.75, s * 0.75]]) {
        x.beginPath();
        x.arc(px, py, s * 0.09, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 1: // listras diagonais
      line(-s * 0.1, s * 0.6, s * 0.6, -s * 0.1);
      line(s * 0.4, s * 1.1, s * 1.1, s * 0.4);
      break;
    case 2: // ondinhas
      x.beginPath();
      x.moveTo(0, h);
      x.quadraticCurveTo(s * 0.25, h - s * 0.2, h, h);
      x.quadraticCurveTo(s * 0.75, h + s * 0.2, s, h);
      x.stroke();
      break;
    case 3: // quadradinhos
      x.fillRect(s * 0.2, s * 0.2, s * 0.14, s * 0.14);
      x.fillRect(s * 0.66, s * 0.66, s * 0.14, s * 0.14);
      break;
    case 4: // anéis
      x.beginPath();
      x.arc(h, h, s * 0.16, 0, Math.PI * 2);
      x.stroke();
      break;
    case 5: // listras horizontais
      line(0, s * 0.3, s, s * 0.3);
      line(0, s * 0.8, s, s * 0.8);
      break;
    case 6: // triângulos
      x.beginPath();
      x.moveTo(h, h - s * 0.15);
      x.lineTo(h + s * 0.15, h + s * 0.12);
      x.lineTo(h - s * 0.15, h + s * 0.12);
      x.closePath();
      x.fill();
      break;
    case 7: // listras verticais
      line(s * 0.3, 0, s * 0.3, s);
      line(s * 0.8, 0, s * 0.8, s);
      break;
    case 8: // xadrezinho
      x.globalAlpha *= 0.6;
      x.fillRect(0, 0, h, h);
      x.fillRect(h, h, h, h);
      x.globalAlpha /= 0.6;
      break;
    case 9: // diagonais invertidas
      line(-s * 0.1, s * 0.4, s * 0.6, s * 1.1);
      line(s * 0.4, -s * 0.1, s * 1.1, s * 0.6);
      break;
    case 10: // losangos
      x.beginPath();
      x.moveTo(h, h - s * 0.17);
      x.lineTo(h + s * 0.13, h);
      x.lineTo(h, h + s * 0.17);
      x.lineTo(h - s * 0.13, h);
      x.closePath();
      x.stroke();
      break;
    default: // zigue-zague
      x.beginPath();
      x.moveTo(0, s * 0.6);
      x.lineTo(s * 0.25, s * 0.4);
      x.lineTo(h, s * 0.6);
      x.lineTo(s * 0.75, s * 0.4);
      x.lineTo(s, s * 0.6);
      x.stroke();
  }
}
