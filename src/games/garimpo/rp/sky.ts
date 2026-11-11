/* ============================================================
 *  GARIMPO — CÉU DO DIA E DA NOITE (visual do clima compartilhado).
 *  Por cima do World (sem mexer nele): cor do céu/névoa por hora (nascer laranja,
 *  meio-dia azul, pôr rosado, noite azul-escura — nunca preta), sol e lua de verdade
 *  (a luz direcional vira luar), estrelas, relâmpago (clarão + trovão), faróis acesos
 *  nas máquinas, lanterna na cabeça do garimpeiro e postes no acampamento.
 *  Sem alocação por quadro: cores/vetores pré-alocados.
 * ============================================================ */
import * as THREE from 'three';
import type { Tier } from '../../../core/quality';
import { windTime } from '../../../3d/nature';
import { weather } from '../weather';
import type { Machine } from '../machines';
import type { World } from '../world';

const FAR = [95, 125, 165, 230];

/** quadros-chave (hora, topo do céu, horizonte/névoa, cor do sol, força do sol, força do ambiente) */
const KEYS: [number, number, number, number, number, number][] = [
  [0, 0x0d1838, 0x22325a, 0x9db4ff, 0.42, 0.62],
  [4.8, 0x101c40, 0x2a3660, 0x9db4ff, 0.4, 0.6],
  [5.6, 0x27346a, 0x8a6a8a, 0xffb27a, 0.5, 0.75],
  [6.3, 0x4a74bf, 0xf4a35e, 0xffa865, 1.3, 1.25],
  [7.6, 0x4d93dc, 0xd9e2e4, 0xffe2b8, 2.3, 1.8],
  [12, 0x4f9be0, 0xbdd4e6, 0xfff0d0, 2.6, 2.0],
  [16.4, 0x4a8cd8, 0xe8d6b4, 0xffe0b0, 2.4, 1.85],
  [17.7, 0x4766a8, 0xff9a5a, 0xff9050, 1.5, 1.4],
  [18.5, 0x2c3470, 0xd0606a, 0xff7a50, 0.7, 0.95],
  [19.3, 0x141d48, 0x3c3460, 0x9db4ff, 0.45, 0.66],
  [24, 0x0d1838, 0x22325a, 0x9db4ff, 0.42, 0.62],
];
const KC = KEYS.map((k) => [new THREE.Color(k[1]), new THREE.Color(k[2]), new THREE.Color(k[3])]);
const RAINC = new THREE.Color(0x7d8794);
export const NIGHT_HEMI_S = new THREE.Color(0x5a6fa8);
export const NIGHT_HEMI_G = new THREE.Color(0x2c2a36);
export const DAY_HEMI_S = new THREE.Color(0xdfefff);
export const DAY_HEMI_G = new THREE.Color(0x8a6a4a);
const GOLD_HEMI = new THREE.Color(0xffb27a);
const WHITE = new THREE.Color(0xffffff);

/** paleta do momento (preenchida por palette()) */
export const PAL = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), sunI: 2.6, hemiI: 2, night: 0, rk: 0, gold: 0 };
/** cores do céu/luz para a hora e o tempo atuais (usado no garimpo e na estrada) */
export function palette(rainK: number): void {
  const h = weather.hour;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0] || 1)));
  const top = PAL.top.copy(KC[i][0]).lerp(KC[i + 1][0], k);
  const hor = PAL.hor.copy(KC[i][1]).lerp(KC[i + 1][1], k);
  PAL.sun.copy(KC[i][2]).lerp(KC[i + 1][2], k);
  let sunI = a[4] + (b[4] - a[4]) * k;
  let hemiI = a[5] + (b[5] - a[5]) * k;
  const night = weather.night;
  // chuva/temporal: cinza e escuro (mas nunca mais escuro que a noite)
  const rk = Math.min(1.15, Math.max(rainK * 0.85, weather.cloud * 0.35) + weather.storm * 0.45);
  const day = 1 - night;
  top.lerp(RAINC, rk * 0.7 * day).multiplyScalar(1 - rk * 0.35 * day);
  hor.lerp(RAINC, rk * 0.75 * day).multiplyScalar(1 - rk * 0.3 * day);
  sunI *= 1 - rk * 0.6;
  hemiI *= 1 - Math.min(1, rk) * 0.4 * day;
  const fl = weather.flash;
  if (fl > 0) {
    const f = fl * fl;
    top.lerp(WHITE, f * 0.45);
    hor.lerp(WHITE, f * 0.3);
    hemiI += f * 1.8;
  }
  // hora dourada (nascer/pôr): tudo puxa para o laranja
  PAL.gold = Math.max(0, 1 - Math.min(Math.abs(h - 6.4), Math.abs(h - 17.9)) / 1.3) * (1 - Math.min(1, rk));
  PAL.sunI = sunI;
  PAL.hemiI = hemiI;
  PAL.night = night;
  PAL.rk = rk;
}
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();

/** posições dos faróis por máquina (locais; frente +z) */
const LAMPS: Record<string, [number, number, number, number]> = {
  pickup: [0.68, 0.26, 2.5, 7],
  truck: [0.95, 0.42, 3.7, 9],
  excavator: [0.45, 2.15, 1.2, 8],
  dozer: [0.5, 0.6, 2.2, 8],
};

export function glowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,.55)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function moonTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, 'rgba(200,215,255,.5)');
  g.addColorStop(1, 'rgba(200,215,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f2f0e4';
  x.beginPath();
  x.arc(64, 64, 22, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(160,160,150,.45)';
  for (const [a, b, r] of [
    [56, 58, 5],
    [70, 70, 4],
    [66, 52, 3],
    [58, 74, 3],
  ])
    (x.beginPath(), x.arc(a, b, r, 0, 7), x.fill());
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** cone de luz aditivo (farol), apontado para +z, ápice na origem */
let beamGeo: THREE.BufferGeometry | null = null;
export const beamU = { uK: { value: 0 } };
let beamMat: THREE.ShaderMaterial | null = null;
export function beam(len: number, rad: number): THREE.Mesh {
  if (!beamGeo) {
    const g = new THREE.CylinderGeometry(1, 0.06, 1, 14, 1, true);
    g.translate(0, -0.5, 0);
    g.rotateX(-Math.PI / 2);
    beamGeo = g;
  }
  if (!beamMat)
    beamMat = new THREE.ShaderMaterial({
      uniforms: beamU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: 'varying float vL; void main(){ vL = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uK; varying float vL; void main(){ float a = (1.0 - vL) * (1.0 - vL) * 0.22 * uK; gl_FragColor = vec4(1.0, 0.93, 0.72, a); }',
    });
  const m = new THREE.Mesh(beamGeo, beamMat);
  m.scale.set(rad, rad * 0.55, len);
  m.rotation.x = 0.1;
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

export interface LampPost {
  x: number;
  z: number;
  y: number;
}

export class SkyRig {
  private stars: THREE.Points;
  private starU = { uA: { value: 0 }, uT: { value: 0 } };
  private moon: THREE.Sprite;
  private sunDisc: THREE.Sprite;
  private beams = new Map<Machine, THREE.Group>();
  private head: THREE.Group;
  private spot: THREE.SpotLight | null = null;
  private campL: THREE.PointLight[] = [];
  private halos: THREE.Sprite[] = [];
  private bulbs: THREE.Mesh[] = [];
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0x5a5040 });
  private glow = glowTex();
  private windPh = 0;
  private bolt: THREE.Mesh;
  private boltPos: Float32Array;
  private lastFlash = 0;
  /** 0..1 noite efetiva usada pelos faróis (inclui temporal escuro) */
  dark = 0;

  constructor(
    private w: World,
    tier: Tier,
    lamps: LampPost[],
  ) {
    const sc = w.scene;
    // estrelas: pontos numa cúpula (seguem a câmera)
    const N = [160, 260, 380, 500][tier];
    const p = new Float32Array(N * 3);
    const s = new Float32Array(N);
    let r = 12345;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.12 + rnd() * 0.88;
      const q = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * q, y, Math.sin(a) * q], i * 3);
      s[i] = 0.6 + rnd() * 1.8;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.starU,
        transparent: true,
        depthWrite: false,
        fog: false,
        vertexShader:
          'attribute float aS; uniform float uT; varying float vA; void main(){ vA = 0.55 + 0.45 * sin(uT * (1.0 + aS) + position.x * 40.0); gl_PointSize = aS * 1.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uA; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float k = 1.0 - smoothstep(0.1, 0.5, length(d)); gl_FragColor = vec4(0.92, 0.95, 1.0, k * uA * vA); }',
      }),
    );
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    sc.add(this.stars);
    // raio: 20 segmentos em zigue-zague (buffer fixo, refeito a cada relâmpago)
    this.boltPos = new Float32Array(20 * 6 * 3);
    const bg0 = new THREE.BufferGeometry();
    bg0.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3));
    this.bolt = new THREE.Mesh(bg0, new THREE.MeshBasicMaterial({ color: 0xf4f0ff, fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.bolt.renderOrder = -7;
    sc.add(this.bolt);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(), fog: false, depthWrite: false, transparent: true }));
    this.moon.renderOrder = -8;
    sc.add(this.moon);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff1c0, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -8;
    sc.add(this.sunDisc);
    // lanterna de cabeça do garimpeiro
    this.head = new THREE.Group();
    const hb = beam(6, 1.6);
    hb.position.set(0, 1.75, 0.2);
    hb.rotation.x = 0.35;
    this.head.add(hb);
    // farol de verdade só na máquina do jogador (custa uma luz no shader: Baixo+)
    if (tier >= 1) {
      const sp = new THREE.SpotLight(0xfff0d0, 0, 46, 0.62, 0.55, 1);
      sp.castShadow = false;
      sc.add(sp, sp.target);
      this.spot = sp;
    }
    // postes do acampamento
    const pg = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6);
    pg.translate(0, 2.1, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });
    const bg = new THREE.SphereGeometry(0.2, 8, 6);
    lamps.forEach((l, i) => {
      const pole = new THREE.Mesh(pg, poleMat);
      pole.position.set(l.x, l.y, l.z);
      sc.add(pole);
      const b = new THREE.Mesh(bg, this.bulbMat);
      b.position.set(l.x, l.y + 4.25, l.z);
      sc.add(b);
      this.bulbs.push(b);
      const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd890, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }));
      h.scale.setScalar(3.2);
      h.position.copy(b.position);
      sc.add(h);
      this.halos.push(h);
      if (tier >= 1 && i < (tier >= 3 ? 3 : 2)) {
        const pl = new THREE.PointLight(0xffc878, 0, 22, 1.4);
        pl.position.set(l.x, l.y + 4, l.z);
        sc.add(pl);
        this.campL.push(pl);
      }
    });
  }

  /** faróis em todas as máquinas (cones aditivos; aparecem só à noite) */
  private beamsFor(ms: Machine[]): void {
    for (const m of ms) {
      if (this.beams.has(m)) continue;
      const L = LAMPS[m.kind];
      const g = new THREE.Group();
      if (L) {
        for (const sx of [1, -1]) {
          const b = beam(L[3], 1.7);
          b.position.set(L[0] * sx, L[1], L[2]);
          g.add(b);
        }
      } else if (m.kind === 'heli') {
        const b = beam(14, 3);
        b.position.set(0, -0.6, 1.5);
        b.rotation.x = 1.0;
        g.add(b);
      }
      g.visible = false;
      m.group.add(g);
      this.beams.set(m, g);
    }
    for (const [m, g] of this.beams)
      if (!ms.includes(m)) {
        g.removeFromParent();
        this.beams.delete(m);
      }
  }

  /** aplica hora + clima na cena (depois do World.setRain, antes de desenhar) */
  apply(dt: number, cam: THREE.Camera, ms: Machine[], cur: Machine | null, worker: Machine | null, rainK: number, time: number): void {
    const w = this.w;
    palette(rainK);
    const h = weather.hour;
    const night = PAL.night;
    const rk = PAL.rk;
    const _top = PAL.top;
    const _hor = PAL.hor;
    const sk = (w as unknown as { skyU: { top: { value: THREE.Color }; bot: { value: THREE.Color } } }).skyU;
    sk.top.value.copy(_top);
    sk.bot.value.copy(_hor);
    const fog = w.scene.fog as THREE.Fog;
    fog.color.copy(_hor);
    (w.scene.background as THREE.Color).copy(_hor);
    const far = FAR[w.tier] ?? 125;
    const vis = 1 - Math.min(0.62, rainK * 0.3 + weather.storm * 0.25 + weather.fog * 0.55 + night * 0.12);
    fog.far = far * vis;
    fog.near = far * Math.max(0.05, 0.45 * vis - rainK * 0.15 - weather.fog * 0.3);
    w.hemi.intensity = PAL.hemiI;
    w.hemi.color.copy(DAY_HEMI_S).lerp(GOLD_HEMI, PAL.gold).lerp(NIGHT_HEMI_S, night);
    w.hemi.groundColor.copy(DAY_HEMI_G).lerp(NIGHT_HEMI_G, night);
    // sol de dia, lua de noite (a mesma luz direcional)
    const up = weather.sunUp;
    const ang = ((h - 6) / 12) * Math.PI;
    const tx = cam.position.x;
    const tz = cam.position.z;
    if (up > -0.08) {
      _d.set(Math.cos(ang) * 0.85, Math.max(0.12, Math.sin(ang)), 0.45).normalize();
      w.sun.color.copy(PAL.sun);
      w.sun.intensity = PAL.sunI * Math.min(1, (up + 0.08) * 5);
    } else {
      const ma = ((h + 6) / 12) * Math.PI;
      _d.set(Math.cos(ma) * 0.7, Math.max(0.25, Math.abs(Math.sin(ma))), -0.4).normalize();
      w.sun.color.set(0x9db4ff);
      w.sun.intensity = 0.55 * (1 - rk * 0.6);
    }
    w.sun.position.set(w.sun.target.position.x + _d.x * 100, _d.y * 100, w.sun.target.position.z + _d.z * 100);
    // discos no céu
    const R = (w.camera.far || 160) * 0.8;
    const sd = this.sunDisc;
    _v.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.45).normalize();
    sd.position.set(tx + _v.x * R, cam.position.y + _v.y * R, tz + _v.z * R);
    sd.scale.setScalar(R * 0.16);
    sd.visible = up > -0.1 && rk < 0.7;
    (sd.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - rk * 1.4) * Math.min(1, (up + 0.1) * 6);
    const ma = ((h + 6) / 12) * Math.PI;
    _v.set(Math.cos(ma) * 0.7, Math.abs(Math.sin(ma)), -0.4).normalize();
    this.moon.position.set(tx + _v.x * R, cam.position.y + _v.y * R, tz + _v.z * R);
    this.moon.scale.setScalar(R * 0.13);
    this.moon.visible = night > 0.05;
    (this.moon.material as THREE.SpriteMaterial).opacity = night * (1 - rk * 0.8);
    this.stars.position.copy(cam.position);
    this.stars.scale.setScalar(R * 0.95);
    this.starU.uA.value = night * (1 - Math.min(1, rk * 1.3));
    this.starU.uT.value = time;
    this.stars.visible = this.starU.uA.value > 0.02;
    // raio visível no céu enquanto o clarão está forte
    const fl = weather.flash;
    if (fl > this.lastFlash + 0.25) this.makeBolt(cam);
    this.lastFlash = fl;
    this.bolt.visible = fl > 0.35;
    (this.bolt.material as THREE.MeshBasicMaterial).opacity = Math.min(1, fl * 1.4);
    // vento: o tempo do vento corre mais rápido no temporal (as copas chacoalham)
    this.windPh += dt * (1 + weather.wind * 2.2);
    windTime.value = this.windPh;
    // luzes: faróis/postes acendem no fim da tarde, na chuva forte e no temporal
    const dark = Math.max(night, Math.min(1, (rainK - 0.55) * 1.5 + weather.storm * 0.4));
    this.dark = dark;
    beamU.uK.value = dark;
    this.beamsFor(ms);
    for (const [m, g] of this.beams) g.visible = dark > 0.05 && (m === cur || !!m.veh?.input.gas || m.kind === 'heli' || m.veh !== null);
    if (worker) {
      if (this.head.parent !== worker.group) worker.group.add(this.head);
      this.head.visible = dark > 0.3 && cur === worker;
    }
    if (this.spot) {
      const sp = this.spot;
      const on = !!cur && cur !== worker && !!cur.veh && dark > 0.05;
      sp.intensity = on ? 60 * dark : 0;
      if (on && cur) {
        const L = LAMPS[cur.kind] ?? [0, 1, 2, 8];
        cur.group.updateMatrixWorld();
        _v.set(0, L[1] + 0.3, L[2]);
        cur.group.localToWorld(_v);
        sp.position.copy(_v);
        _v.set(0, -1.5, L[2] + 14);
        cur.group.localToWorld(_v);
        sp.target.position.copy(_v);
      }
    }
    const lit = Math.max(0, Math.min(1, (dark - 0.15) * 1.6));
    this.bulbMat.color.setRGB(0.35 + lit * 0.65, 0.31 + lit * 0.6, 0.25 + lit * 0.4);
    for (const hs of this.halos) (hs.material as THREE.SpriteMaterial).opacity = lit * 0.85;
    for (const pl of this.campL) pl.intensity = lit * 26;
  }

  private makeBolt(cam: THREE.Camera): void {
    // um pouco à frente da câmera, ao longe
    cam.getWorldDirection(_v);
    const a = Math.atan2(_v.x, _v.z) + (Math.random() - 0.5) * 1.2;
    const R = 120;
    let x = cam.position.x + Math.sin(a) * R;
    let z = cam.position.z + Math.cos(a) * R;
    let y = cam.position.y + 70;
    const P = this.boltPos;
    // largura para o lado da câmera (fita virada para ela)
    const rx = Math.cos(a) * 0.7;
    const rz = -Math.sin(a) * 0.7;
    let k = 0;
    for (let i = 0; i < 20; i++) {
      const w = 1 - i / 26;
      const nx = x + (Math.random() - 0.5) * 10;
      const nz = z + (Math.random() - 0.5) * 4;
      const ny = y - 3.8 - Math.random() * 1.6;
      const v = [x - rx * w, y, z - rz * w, x + rx * w, y, z + rz * w, nx + rx * w, ny, nz + rz * w, x - rx * w, y, z - rz * w, nx + rx * w, ny, nz + rz * w, nx - rx * w, ny, nz - rz * w];
      for (let j = 0; j < 18; j++) P[k++] = v[j];
      x = nx;
      y = ny;
      z = nz;
    }
    (this.bolt.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    for (const g of this.beams.values()) g.removeFromParent();
    this.beams.clear();
    this.head.removeFromParent();
    this.stars.geometry.dispose();
    this.glow.dispose();
  }
}
