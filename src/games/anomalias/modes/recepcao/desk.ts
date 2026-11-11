/* ============================================================
 *  RECEPÇÃO — cena 3D: a cabine da portaria (mesa, vidro com furinhos
 *  para falar, monitor da câmera de dentro), o saguão de entrada do
 *  prédio à noite (porta de vidro para a rua com chuva, porta lateral
 *  para dentro com luzinha, ESPELHO com o reflexo do visitante, lâmpada
 *  em cima do lugar do visitante) e, longe dali, o corredor de DENTRO
 *  (o que o monitor mostra: quem você deixou entrar fica lá...).
 * ============================================================ */
import * as THREE from 'three';
import { nightSky, plaster, signTex, wainscot, wallpaper } from '../../maps/nightkit/tex';
import { Builder } from '../build';
import { canvasTex } from '../common';

export interface Desk {
  b: Builder;
  root: THREE.Group;
  cam: { x: number; y: number; z: number; pitch: number };
  spot: THREE.Vector3;
  entry: THREE.Vector3;
  outside: THREE.Vector3;
  sideDoorPos: THREE.Vector3;
  inside: THREE.Vector3;
  mirrorPos: THREE.Vector3;
  doorL: THREE.Object3D;
  doorR: THREE.Object3D;
  sideDoor: THREE.Object3D;
  sideLamp: THREE.MeshBasicMaterial;
  vestLight: THREE.PointLight;
  vestBulb: THREE.MeshBasicMaterial;
  deskLight: THREE.PointLight;
  hemi: THREE.HemisphereLight;
  flash: THREE.SpotLight;
  monitorMat: THREE.MeshBasicMaterial;
  /** corredor de dentro (monitor) */
  insideCam: THREE.PerspectiveCamera;
  insideSpots: THREE.Vector3[];
  insideBocudo: THREE.Vector3;
  rain: THREE.Mesh;
  windowY: number;
  update(dt: number): void;
}

export function buildDesk(): Desk {
  const b = new Builder();
  const M = b.mats;
  const root = new THREE.Group();
  /* ---------- cabine (lado do jogador) ---------- */
  const floorTex = b.own(
    canvasTex(128, 128, (x) => {
      x.fillStyle = '#d9d2c4';
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#5b5a72';
      x.fillRect(0, 0, 64, 64);
      x.fillRect(64, 64, 64, 64);
    }),
  ) as THREE.CanvasTexture;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(5, 6);
  const floorM = M.lam('#ffffff', 0, floorTex);
  const boothWall = M.lam('#ffffff', 0, b.rep(wallpaper('stripes', '#2f4a6b', '#355377', '#2a4060'), 3, 1));
  b.plane(root, 4, 2.4, 0, 0, 0.6, M.lam('#4a3a33'), 0, -Math.PI / 2); // chão da cabine
  b.box(root, 4, 2.8, 0.1, 0, 1.4, 1.85, boothWall); // parede de trás
  b.box(root, 0.1, 2.8, 2.6, -1.9, 1.4, 0.6, boothWall);
  b.box(root, 0.1, 2.8, 2.6, 1.9, 1.4, 0.6, boothWall);
  b.plane(root, 4, 2.6, 0, 2.8, 0.6, M.lam('#1e2433'), 0, Math.PI / 2);
  // parede da janela (z = -0.6): base, topo, laterais
  const WY0 = 0.6,
    WY1 = 2.1,
    WX = 1.3;
  const wallM = M.lam('#3d5677');
  b.box(root, 4, WY0, 0.14, 0, WY0 / 2, -0.6, wallM);
  b.box(root, 4, 2.8 - WY1, 0.14, 0, (WY1 + 2.8) / 2, -0.6, wallM);
  b.box(root, 2 - WX, WY1 - WY0, 0.14, -(WX + 2) / 2, (WY0 + WY1) / 2, -0.6, wallM);
  b.box(root, 2 - WX, WY1 - WY0, 0.14, (WX + 2) / 2, (WY0 + WY1) / 2, -0.6, wallM);
  // moldura + vidro
  const frameM = M.lam('#d8d8e0');
  b.box(root, WX * 2 + 0.1, 0.06, 0.18, 0, WY0, -0.6, frameM);
  b.box(root, WX * 2 + 0.1, 0.06, 0.18, 0, WY1, -0.6, frameM);
  b.box(root, 0.06, WY1 - WY0, 0.18, -WX, (WY0 + WY1) / 2, -0.6, frameM);
  b.box(root, 0.06, WY1 - WY0, 0.18, WX, (WY0 + WY1) / 2, -0.6, frameM);
  const glassM = M.own(new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.07, depthWrite: false }));
  b.plane(root, WX * 2, WY1 - WY0, 0, (WY0 + WY1) / 2, -0.6, glassM);
  // furinhos para falar (anel de pontinhos)
  const holes = b.own(
    canvasTex(128, 128, (x) => {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      for (let r = 10; r < 60; r += 13)
        for (let a = 0; a < Math.PI * 2; a += 0.75 / (r / 12)) {
          x.beginPath();
          x.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3, 0, Math.PI * 2);
          x.fill();
        }
    }),
  );
  b.plane(root, 0.2, 0.2, 0.95, 0.85, -0.585, M.own(new THREE.MeshBasicMaterial({ map: holes, transparent: true, depthWrite: false })));
  // balcão de fora (onde o visitante apoia o crachá)
  b.box(root, WX * 2 + 0.3, 0.06, 0.34, 0, WY0 - 0.02, -0.8, M.lam('#b98b5e'));
  // mesa
  const deskM = M.lam('#8a5a3a');
  b.box(root, 3.4, 0.06, 0.6, 0, 0.72, -0.27, M.lam('#c79a68'));
  b.box(root, 3.3, 0.66, 0.05, 0, 0.36, 0.0, deskM);
  // monitor (câmera de dentro)
  const mon = new THREE.Group();
  b.box(mon, 0.56, 0.42, 0.36, 0, 0.21, 0, M.lam('#4a4a58'));
  const monitorMat = M.own(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  b.plane(mon, 0.46, 0.33, 0, 0.22, -0.182, monitorMat, Math.PI);
  mon.position.set(-1.05, 0.75, -0.3);
  mon.rotation.y = Math.PI + 0.45;
  root.add(mon);
  // luminária, carimbo, sininho, prancheta
  b.box(root, 0.16, 0.03, 0.16, 1.15, 0.765, -0.3, M.lam('#ff8fb1'));
  b.box(root, 0.03, 0.4, 0.03, 1.15, 0.97, -0.3, M.lam('#ff8fb1'));
  const shade = new THREE.Mesh(b.geo('shade', () => new THREE.ConeGeometry(0.14, 0.14, 12, 1, true)), M.lam('#ffd34a', 0.5));
  shade.position.set(1.15, 1.18, -0.3);
  root.add(shade);
  b.box(root, 0.3, 0.02, 0.4, 0.62, 0.76, -0.18, M.lam('#ffffff'));
  b.box(root, 0.1, 0.08, 0.1, -0.45, 0.79, -0.35, M.lam('#ff4f6a'));
  const bell = new THREE.Mesh(b.geo('bell', () => new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.lam('#ffd34a', 0.2));
  bell.position.set(-0.15, 0.75, -0.48);
  root.add(bell);
  const deskLight = new THREE.PointLight('#ffd9a0', 2.2, 4, 2);
  deskLight.position.set(1.0, 1.1, -0.2);
  root.add(deskLight);

  /* ---------- saguão (lado do visitante) z: -0.67 .. -5 ---------- */
  const V0 = -0.67,
    V1 = -5.0,
    VX = 2.2,
    VH = 2.8;
  const vfloor = new THREE.Mesh(b.planeG(VX * 2, V0 - V1), floorM);
  vfloor.rotation.x = -Math.PI / 2;
  vfloor.position.set(0, 0, (V0 + V1) / 2);
  root.add(vfloor);
  const pap = M.lam('#ffffff', 0, b.rep(wallpaper('dots', '#6b5a8e', '#7b6a9e', '#5e4e80'), 2, 1.2));
  const ceilM = M.lam('#ffffff', 0, b.rep(plaster(), 2, 2));
  b.plane(root, VX * 2, V0 - V1, 0, VH, (V0 + V1) / 2, ceilM, 0, Math.PI / 2);
  // parede direita com a porta lateral (z -1.9 .. -3.1)
  const side = (x: number, z0: number, z1: number, ry: number) => {
    const L = Math.abs(z1 - z0);
    const zc = (z0 + z1) / 2;
    b.plane(root, L, VH - 0.9, x, 0.9 + (VH - 0.9) / 2, zc, pap, ry);
    b.plane(root, L, 0.9, x, 0.45, zc, M.lam('#c9c4d8', 0, b.rep(wainscot(), L / 1.2, 1)), ry);
    b.box(root, 0.04, 0.05, L, x + (ry > 0 ? 0.02 : -0.02), 0.92, zc, M.lam('#8a6a9e'));
  };
  side(VX, V0, -1.9, -Math.PI / 2);
  side(VX, -3.1, V1, -Math.PI / 2);
  b.plane(root, 1.2, VH - 2.2, VX, 2.2 + (VH - 2.2) / 2, -2.5, pap, -Math.PI / 2);
  // porta lateral (para dentro)
  const sideDoor = new THREE.Group();
  sideDoor.position.set(VX - 0.02, 0, -1.92);
  const sd = b.box(sideDoor, 0.06, 2.15, 1.14, 0, 1.08, -0.57, M.lam('#7a4e9e'));
  b.box(sd, 0.08, 0.06, 0.06, -0.02, -0.05, -0.45, M.lam('#ffd34a'));
  root.add(sideDoor);
  b.box(root, 0.12, 0.08, 1.3, VX - 0.04, 2.2, -2.5, M.lam('#d8d8e0'));
  const sideLamp = M.own(new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
  b.box(root, 0.06, 0.12, 0.2, VX - 0.06, 2.42, -2.5, sideLamp);
  // parede esquerda com o ESPELHO (z -1.4 .. -2.8)
  side(-VX, V0, -1.4, Math.PI / 2);
  side(-VX, -2.8, V1, Math.PI / 2);
  b.plane(root, 1.4, VH - 1.95, -VX, 1.95 + (VH - 1.95) / 2, -2.1, pap, Math.PI / 2);
  b.plane(root, 1.4, 0.35, -VX, 0.175, -2.1, M.lam('#c9c4d8'), Math.PI / 2);
  // caixa do reflexo (atrás do espelho)
  const mirrorPos = new THREE.Vector3(-VX - 1.0, 0, -2.6);
  const mroom = new THREE.Mesh(b.boxG(2.4, VH, 3.0), M.own(new THREE.MeshLambertMaterial({ color: '#7d6aa2', side: THREE.BackSide })));
  mroom.position.set(-VX - 1.2, VH / 2, -2.5);
  root.add(mroom);
  const mfloor = new THREE.Mesh(b.planeG(2.4, 3.0), floorM);
  mfloor.rotation.x = -Math.PI / 2;
  mfloor.position.set(-VX - 1.2, 0.002, -2.5);
  root.add(mfloor);
  const mLight = new THREE.PointLight('#ffe6b8', 3, 4, 2);
  mLight.position.set(-VX - 1.0, 2.2, -2.8);
  root.add(mLight);
  const mirM = M.own(new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.16, depthWrite: false }));
  b.plane(root, 1.4, 1.6, -VX + 0.005, 1.15, -2.1, mirM, Math.PI / 2);
  const mf = M.lam('#e0b84a');
  b.box(root, 0.06, 0.07, 1.5, -VX + 0.03, 1.95, -2.1, mf);
  b.box(root, 0.06, 0.07, 1.5, -VX + 0.03, 0.35, -2.1, mf);
  b.box(root, 0.06, 1.67, 0.07, -VX + 0.03, 1.15, -1.37, mf);
  b.box(root, 0.06, 1.67, 0.07, -VX + 0.03, 1.15, -2.83, mf);
  // parede do fundo com a porta de vidro para a rua
  const DX = 0.75;
  b.plane(root, VX - DX, VH, -(VX + DX) / 2, VH / 2, V1, pap);
  b.plane(root, VX - DX, VH, (VX + DX) / 2, VH / 2, V1, pap);
  b.plane(root, DX * 2, VH - 2.3, 0, 2.3 + (VH - 2.3) / 2, V1, pap);
  const exitSign = M.basic('#ffffff', signTex('🚪 →', '#1fae5b', '#ffffff', 256, 96));
  b.plane(root, 0.5, 0.19, 0, 2.5, V1 + 0.02, exitSign);
  const doorM = M.own(new THREE.MeshBasicMaterial({ color: '#a8d8ff', transparent: true, opacity: 0.18, depthWrite: false }));
  const doorL = new THREE.Group(),
    doorR = new THREE.Group();
  for (const [g, s] of [
    [doorL, -1],
    [doorR, 1],
  ] as [THREE.Group, number][]) {
    g.position.set((s * DX) / 2, 0, V1 + 0.03);
    b.plane(g, DX - 0.02, 2.28, 0, 1.14, 0, doorM);
    b.box(g, DX, 0.06, 0.05, 0, 0.03, 0, frameM);
    b.box(g, DX, 0.06, 0.05, 0, 2.27, 0, frameM);
    b.box(g, 0.05, 2.3, 0.05, (s * DX) / 2, 1.15, 0, frameM);
    b.box(g, 0.04, 0.5, 0.04, (-s * DX) / 2 + s * 0.08, 1.05, -0.03, M.lam('#b0b0c0'));
    root.add(g);
  }
  // rua: céu, poste, calçada, chuva
  const outside = new THREE.Vector3(0, 0, V1 - 2.2);
  b.plane(root, 9, 5, 0, 2.3, V1 - 4.2, M.basic('#ffffff', nightSky(true, true)));
  const street = new THREE.Mesh(b.planeG(9, 4.2), M.lam('#2a2c3a'));
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, -0.01, V1 - 2.1);
  root.add(street);
  b.box(root, 0.08, 3.2, 0.08, 1.6, 1.6, V1 - 2.6, M.lam('#3a3a48'));
  b.box(root, 0.36, 0.14, 0.24, 1.45, 3.15, V1 - 2.6, M.basic('#ffe6a0'));
  const rainTex = b.own(
    canvasTex(128, 256, (x) => {
      x.strokeStyle = 'rgba(190,220,255,.55)';
      x.lineWidth = 1.5;
      for (let i = 0; i < 70; i++) {
        const px = Math.random() * 128,
          py = Math.random() * 256;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px - 3, py + 18);
        x.stroke();
      }
    }),
  ) as THREE.CanvasTexture;
  rainTex.wrapS = rainTex.wrapT = THREE.RepeatWrapping;
  rainTex.repeat.set(3, 1.5);
  const rain = b.plane(root, 8, 4, 0, 1.9, V1 - 1.2, M.own(new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, depthWrite: false })));
  // detalhes do saguão: banco, planta, porta-guarda-chuva, quadro de avisos com ícones
  b.box(root, 0.45, 0.42, 1.2, VX - 0.3, 0.21, -4.1, M.lam('#c76b4a'));
  b.box(root, 0.45, 0.06, 1.2, VX - 0.3, 0.45, -4.1, M.lam('#e08a62'));
  const pot = b.box(root, 0.36, 0.42, 0.36, -VX + 0.35, 0.21, -4.5, M.lam('#e07a5f'));
  const leaf = new THREE.Mesh(b.geo('leaf', () => new THREE.IcosahedronGeometry(0.42, 0)), M.lam('#3fae6a'));
  leaf.position.set(0, 0.6, 0);
  leaf.scale.set(1, 1.4, 1);
  pot.add(leaf);
  b.box(root, 0.24, 0.5, 0.24, -VX + 0.35, 0.25, -3.6, M.lam('#4a6fa5'));
  const umb = b.box(root, 0.03, 0.8, 0.03, -VX + 0.38, 0.6, -3.58, M.lam('#ff5c9a'));
  umb.rotation.z = 0.15;
  const notice = M.basic('#ffffff', signTex('🕛 ➜ 🕕', '#fff4c8', '#3a2a10', 256, 128, '#c79a2a'));
  b.plane(root, 0.9, 0.45, -VX + 0.01, 1.7, -4.0, notice, Math.PI / 2);
  // lâmpada sobre o lugar do visitante
  const spot = new THREE.Vector3(0, 0, -2.0);
  const vestBulb = M.own(new THREE.MeshBasicMaterial({ color: '#fff1c8' }));
  const lampDisc = new THREE.Mesh(b.geo('disc', () => new THREE.CylinderGeometry(0.26, 0.3, 0.06, 18)), vestBulb);
  lampDisc.position.set(0, VH - 0.03, -2.0);
  root.add(lampDisc);
  const vestLight = new THREE.PointLight('#ffe6b8', 9, 9, 2);
  vestLight.position.set(0, VH - 0.25, -2.0);
  root.add(vestLight);
  const hemi = new THREE.HemisphereLight('#8a96d0', '#3a2f4a', 0.9);
  root.add(hemi);
  // lanterna (sai da cabine)
  const flash = new THREE.SpotLight('#fff3d6', 0, 9, 0.42, 0.7, 1);
  flash.position.set(0.25, 1.45, 0.1);
  flash.target.position.copy(spot).setY(0.6);
  root.add(flash, flash.target);

  /* ---------- corredor de DENTRO (só no monitor) ---------- */
  const IN = new THREE.Group();
  IN.position.set(40, 0, 0);
  root.add(IN);
  const inFloor = new THREE.Mesh(b.planeG(3, 12), M.lam('#ffffff', 0, b.rep(floorTex, 2, 6)));
  inFloor.rotation.x = -Math.PI / 2;
  inFloor.position.set(0, 0, -5);
  IN.add(inFloor);
  const inWall = M.lam('#ffffff', 0, b.rep(wallpaper('stars', '#4a5d8a', '#ffe680', '#7f93c4'), 4, 1.3));
  b.plane(IN, 12, 2.7, -1.5, 1.35, -5, inWall, Math.PI / 2);
  b.plane(IN, 12, 2.7, 1.5, 1.35, -5, inWall, -Math.PI / 2);
  b.plane(IN, 3, 2.7, 0, 1.35, -11, inWall);
  b.plane(IN, 3, 12, 0, 2.7, -5, ceilM, 0, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const s = i % 2 ? 1 : -1;
    b.box(IN, 0.06, 2.1, 0.95, s * 1.47, 1.05, -2.5 - i * 3, M.lam(['#ff8fb1', '#7dc2ff', '#ffd34a'][i]));
    b.plane(IN, 0.5, 0.06, 0, 2.69, -2 - i * 3, M.basic('#fff6d0'), 0, Math.PI / 2);
  }
  const inLight = new THREE.PointLight('#e8f0ff', 6, 10, 2);
  inLight.position.set(0, 2.4, -5);
  IN.add(inLight);
  const insideCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 30);
  insideCam.position.set(40 + 1.1, 2.4, 0.4);
  insideCam.lookAt(40 - 0.2, 0.6, -7);
  const insideSpots = [
    new THREE.Vector3(40 - 0.6, 0, -2.6),
    new THREE.Vector3(40 + 0.7, 0, -4.2),
    new THREE.Vector3(40 - 0.5, 0, -5.8),
    new THREE.Vector3(40 + 0.5, 0, -7.4),
    new THREE.Vector3(40 - 0.6, 0, -8.6),
    new THREE.Vector3(40 + 0.6, 0, -9.6),
  ];
  const insideBocudo = new THREE.Vector3(40, 0, -9.8);

  let rt = 0;
  return {
    b,
    root,
    cam: { x: 0, y: 1.35, z: 0.35, pitch: -0.17 },
    spot,
    entry: new THREE.Vector3(0, 0, V1 + 0.6),
    outside,
    sideDoorPos: new THREE.Vector3(VX - 0.4, 0, -2.5),
    inside: new THREE.Vector3(VX + 1.2, 0, -2.5),
    mirrorPos,
    doorL,
    doorR,
    sideDoor,
    sideLamp,
    vestLight,
    vestBulb,
    deskLight,
    hemi,
    flash,
    monitorMat,
    insideCam,
    insideSpots,
    insideBocudo,
    rain,
    windowY: WY0,
    update(dt: number) {
      rt += dt;
      rainTex.offset.y = (rt * 1.6) % 1;
      rainTex.offset.x = (rt * 0.2) % 1;
    },
  };
}
