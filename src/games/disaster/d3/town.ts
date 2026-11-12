/* ============================================================
 *  SOBREVIVA AOS DESASTRES 3D — planta da cidadezinha.
 *  Uma vila de verdade dentro da ilha (raio R): rua principal leste–oeste, uma segunda rua ao norte e
 *  uma avenida norte–sul; casas em lotes com a porta virada para a rua (sempre o lado −z: os bots e o
 *  abrigo contam com isso), quintal nos fundos com cerca, praça e morro ao sul, árvores de calçada.
 *  Só números: quem desenha é game3d (casas pré-moldadas, prefab.ts) e env3d (chão, ruas, adereços).
 * ============================================================ */

export interface Lot {
  /** centro da casa */
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** escada do telhado: −1 (lado x0) / 1 (lado x1) */
  side: number;
  wall: string;
  roof: string;
}
/** segmento de rua (meia-largura hw) */
export interface Street {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  hw: number;
}
export interface Fence {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Spot {
  x: number;
  z: number;
}
export interface TownPlan {
  lots: Lot[];
  streets: Street[];
  fences: Fence[];
  /** árvores de calçada/quintal/parque (escala) */
  trees: (Spot & { s: number })[];
  /** postes de luz (ao lado das ruas) */
  lamps: (Spot & { ry: number })[];
  /** placas de rua (esquinas) e a placa da cidade */
  signs: (Spot & { ry: number; kind: 'street' | 'welcome' })[];
  /** caixas de correio (frente dos lotes) */
  mail: (Spot & { ry: number })[];
  /** vagas de carro (ao longo das ruas) */
  parking: (Spot & { ry: number })[];
  /** bancos da praça */
  benches: (Spot & { ry: number })[];
  plaza: Spot & { r: number };
  hill: Spot;
  towers: Spot[];
  open: Spot[];
}

/** distância de (x,z) ao segmento */
export function segDist(x: number, z: number, s: { x0: number; z0: number; x1: number; z1: number }): number {
  const vx = s.x1 - s.x0;
  const vz = s.z1 - s.z0;
  const l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / l2));
  return Math.hypot(x - s.x0 - vx * t, z - s.z0 - vz * t);
}

/**
 * Planta da cidade. `nHouses` casas (5..7), cores do mapa, espelhada em x ao acaso.
 * Tudo cabe em R−4 (a cerca da borda fica em R).
 */
export function planTown(r: () => number, R: number, nHouses: number, walls: string[], roofs: string[], road: boolean): TownPlan {
  const flip = r() < 0.5 ? -1 : 1;
  const hw = road ? 2.1 : 1.3;
  const zMain = -8;
  const zNorth = 12;
  const streets: Street[] = [
    { x0: -R + 1, z0: zMain, x1: R - 1, z1: zMain, hw },
    { x0: -R * 0.78, z0: zNorth, x1: R * 0.78, z1: zNorth, hw: hw * 0.85 },
    { x0: 0, z0: -R + 3, x1: 0, z1: R - 3, hw: hw * 0.9 },
  ];
  // lotes candidatos: fileira A (norte da rua principal) e B (norte da 2ª rua); porta para −z (a rua)
  const rowA = [-17, -8.2, 8.2, 17];
  const rowB = [-15.5, -6.6, 6.6, 15.5];
  const cand: { x: number; zFront: number; row: number }[] = [];
  for (const x of rowA) cand.push({ x: x * flip, zFront: zMain + hw + 1.7, row: 0 });
  for (const x of rowB) cand.push({ x: x * flip, zFront: zNorth + hw * 0.85 + 1.7, row: 1 });
  // a fileira A sempre cheia; a B recebe o resto, alternando lados
  const order = [0, 1, 2, 3, 5, 6, 4, 7];
  const lots: Lot[] = [];
  for (let k = 0; k < order.length && lots.length < nHouses; k++) {
    const c = cand[order[k]];
    const w = 5 + Math.floor(r() * 2) + (r() < 0.3 ? 0.5 : 0);
    const d = 5 + (r() < 0.35 ? 0.6 : 0);
    const h = 3.2 + (r() < 0.3 ? 0.6 : 0);
    const z = c.zFront + d / 2;
    // escada do lado oposto ao centro (deixa o vão entre casas e a avenida livres)
    const side = c.x < 0 ? -1 : 1;
    if (Math.hypot(Math.abs(c.x) + w / 2 + 1.2, z + d / 2) > R - 3) continue;
    lots.push({ x: c.x, z, w, d, h, side, wall: walls[Math.floor(r() * walls.length)], roof: roofs[Math.floor(r() * roofs.length)] });
  }
  // cercas: laterais e fundo do quintal (atrás da casa), sem fechar a frente/porta nem a escada
  const fences: Fence[] = [];
  for (const L of lots) {
    const zb = L.z + L.d / 2;
    const back = Math.min(zb + 4.2, (L.z < zNorth ? zNorth - hw - 0.8 : R - 6));
    if (back - zb < 1.5) continue;
    const xl = L.x - L.w / 2 - 0.6;
    const xr = L.x + L.w / 2 + 0.6;
    fences.push({ x0: xl, z0: back, x1: xr, z1: back });
    // laterais começam no fundo da casa (o corredor da escada fica livre)
    fences.push({ x0: xl, z0: zb + 0.4, x1: xl, z1: back });
    fences.push({ x0: xr, z0: zb + 0.4, x1: xr, z1: back });
  }
  // praça e morro ao sul da rua principal
  const plaza = { x: 9 * flip, z: -20, r: 5.2 };
  const hill = { x: -14 * flip, z: -21 };
  const towers: Spot[] = [
    { x: 20 * flip, z: -15.5 },
    { x: 3.2 * flip, z: -26 },
    { x: -24 * flip, z: -11.5 },
    { x: 24 * flip, z: 4.5 },
    { x: -3.6 * flip, z: 27 },
  ];
  // árvores: calçada (entre lotes, na frente), quintais, parque ao sul e ao redor da praça
  const trees: (Spot & { s: number })[] = [];
  const zA = zMain + hw + 0.8;
  for (const x of [-25, -12.6, 12.6, 25]) trees.push({ x: x * flip + (r() - 0.5) * 0.6, z: zA, s: 0.8 + r() * 0.25 });
  for (const L of lots) if (r() < 0.8) trees.push({ x: L.x + (r() - 0.5) * (L.w - 2), z: L.z + L.d / 2 + 2.4, s: 0.85 + r() * 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    trees.push({ x: plaza.x + Math.cos(a) * (plaza.r + 2.2), z: plaza.z + Math.sin(a) * (plaza.r + 2.2), s: 0.75 + r() * 0.25 });
  }
  for (let i = 0; i < 6; i++) trees.push({ x: (-4 - r() * 20) * flip, z: -28 + r() * 4, s: 0.8 + r() * 0.35 });
  // postes ao longo das ruas
  const lamps: (Spot & { ry: number })[] = [];
  for (let x = -24; x <= 24; x += 12) lamps.push({ x: x + 6, z: zMain - hw - 0.5, ry: 0 });
  for (let x = -18; x <= 18; x += 12) lamps.push({ x: x + 6, z: zNorth - hw - 0.5, ry: 0 });
  for (const z of [-22, 2, 22]) lamps.push({ x: hw + 0.5, z, ry: Math.PI / 2 });
  // placas: esquinas + "bem-vindo" na entrada da avenida
  const signs: (Spot & { ry: number; kind: 'street' | 'welcome' })[] = [
    { x: hw + 0.6, z: zMain - hw - 0.6, ry: 0, kind: 'street' },
    { x: -hw - 0.6, z: zNorth - hw - 0.6, ry: 0, kind: 'street' },
    { x: -hw - 2.2, z: -R + 6, ry: 0, kind: 'welcome' },
  ];
  const mail = lots.map((L) => ({ x: L.x - L.side * (L.w / 2 - 0.3), z: L.z - L.d / 2 - 1.3, ry: 0 }));
  // vagas: lado sul da rua principal e da 2ª rua (longe da porta das casas)
  const parking: (Spot & { ry: number })[] = [];
  for (const x of [-21, -5.5, 15.5]) parking.push({ x: x * flip, z: zMain - hw - 1.6, ry: Math.PI / 2 });
  for (const x of [-10.5, 10.8]) parking.push({ x: x * flip, z: zNorth - hw - 1.6, ry: Math.PI / 2 });
  const benches: (Spot & { ry: number })[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    benches.push({ x: plaza.x + Math.cos(a) * (plaza.r - 0.6), z: plaza.z + Math.sin(a) * (plaza.r - 0.6), ry: -a + Math.PI / 2 });
  }
  // lugares abertos (largada/bots): praça, cruzamentos, ruas largas, parque
  const open: Spot[] = [
    { x: plaza.x, z: plaza.z },
    { x: 0, z: zMain },
    { x: 0, z: zNorth },
    { x: 13 * flip, z: zMain },
    { x: -13 * flip, z: zMain },
    { x: 0, z: -20 },
    { x: 12 * flip, z: -28 },
    { x: -12 * flip, z: zNorth },
  ];
  return { lots, streets, fences, trees, lamps, signs, mail, parking, benches, plaza, hill, towers, open };
}
