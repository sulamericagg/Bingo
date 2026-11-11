/* ============================================================
 *  GARIMPO — A ESTRADA (fase separada, em pedaços de 160 m carregados à frente).
 *  Pátio (engatar as carretas de ré) → rodovia com curvas, morros, pontes, postos,
 *  paradas e cidades → destino (desengatar e receber). Mesmo céu/hora/clima do
 *  garimpo (weather.ts + paleta do céu), neblina e pouca distância de desenho para
 *  tablets velhos, árvores da natureza compartilhada instanciadas, trânsito leve,
 *  rádio, piloto automático, pular trechos nas paradas.
 *  Sem alocação por quadro (vetores do módulo; malhas só ao carregar pedaço).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { audio } from '../../../core/audio';
import type { Tier } from '../../../core/quality';
import { bindButton, createJoystick, type BoundButton, type Joystick } from '../../../ui/touch';
import { groundDetailTexture, natureMat, natureTree } from '../../../3d/nature';
import { notify } from '../../../ui/notify';
import { Rain } from '../fx';
import { setLod } from '../kit';
import { weather } from '../weather';
import type { World } from '../world';
import { RI } from '../rp/icons';
import { beam, beamU, glowTex, SkyRig } from '../rp/sky';
import { Radio } from '../rp/sound';
import type { Ctx } from '../rp/events';
import { COMBOS, DESTS, RIG_TANK, type Trip } from './freight';
import { buildCar, buildPump, buildShop, buildSign, buildTractor, buildTrailer, type TrailerParts } from './models';
import { DS, HALF, Road, SHOULDER, YARD, type Stop } from './road';
import { LANE, Rig } from './rig';

const CH = 160;
const NAMES = ['Boa Vista', 'Água Clara', 'São Jorge', 'Pedra Lisa', 'Lagoa Seca', 'Serra Verde', 'Vale do Sol', 'Rio Fundo', 'Morro Alto', 'Bom Jardim', 'Ouro Fino', 'Campo Belo', 'Santa Rita', 'Três Pontes', 'Canaã', 'Buriti', 'Ipê Roxo', 'Jatobá', 'Taquara', 'Aroeira'];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const P5 = [0, 0, 0, 0, 0];

export interface HaulHost {
  root: HTMLElement;
  diff: number;
  expert: () => boolean;
  tier: Tier;
  seed: number;
  money: () => number;
  /** paga (false = sem dinheiro) */
  spend: (n: number) => boolean;
  dieselPrice: number;
  fuelOn: boolean;
  /** dispara um evento (estrada/cidade) e espera o cartão fechar */
  event: (c: Partial<Ctx>) => Promise<void>;
  /** ações do lugar (botões grandes à direita) */
  actions: (list: { id: string; icon: keyof typeof RI; label: string; sub?: [keyof typeof RI, string]; cls?: string; run: () => void }[]) => void;
  sleep: (hours: number | null) => Promise<void>;
  eat: () => void;
  energyLow: () => boolean;
  pause: () => void;
  /** fim: entregue (true) */
  arrive: () => void;
  say: (s: string) => void;
}

interface Chunk {
  i: number;
  grp: THREE.Group;
  trees: THREE.Matrix4[][];
}

/* ---------------- texturas/materiais compartilhados ---------------- */
let asphaltTex: THREE.CanvasTexture | null = null;
function asphalt(): THREE.CanvasTexture {
  if (asphaltTex) return asphaltTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#4a4c50';
  x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 60 + Math.random() * 40;
    x.fillStyle = `rgb(${v},${v},${v + 3})`;
    x.fillRect(Math.random() * 128, Math.random() * 256, 1.5, 1.5);
  }
  // remendos
  x.fillStyle = 'rgba(30,30,32,.35)';
  x.fillRect(20, 40, 30, 50);
  x.fillRect(80, 170, 22, 40);
  // faixas brancas nas bordas, amarela tracejada no meio
  x.fillStyle = '#e8e6de';
  x.fillRect(5, 0, 4, 256);
  x.fillRect(119, 0, 4, 256);
  x.fillStyle = '#f2c21a';
  x.fillRect(61, 0, 3, 140);
  x.fillRect(65, 0, 3, 140);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  asphaltTex = t;
  return t;
}

export class Highway {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.5, 420);
  readonly road: Road;
  readonly rig: Rig;
  private sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  private hemi = new THREE.HemisphereLight(0xdfefff, 0x6a5a3a, 2);
  private skyU = { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } };
  private skyMesh: THREE.Mesh;
  private sky: SkyRig;
  private rain: Rain;
  private chunks = new Map<number, Chunk>();
  private roadMat: THREE.MeshLambertMaterial;
  private groundMat: THREE.MeshLambertMaterial;
  private miscMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private waterMat = new THREE.MeshLambertMaterial({ color: 0x3f7fa0, transparent: true, opacity: 0.85, emissive: 0x0a2232 });
  private haloMat: THREE.SpriteMaterial;
  private treeMeshes: THREE.InstancedMesh[] = [];
  private tractor: THREE.Group;
  private trailers: TrailerParts[] = [];
  private beams: THREE.Group;
  private spot: THREE.SpotLight | null = null;
  private cars: { g: THREE.Group; s: number; v: number; lat: number }[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  camMode = 0;
  private time = 0;
  private ahead: number;
  // HUD
  private hud: HTMLDivElement;
  private joy: Joystick;
  private btns: BoundButton[] = [];
  private held = { gas: false, brake: false };
  private keys = new Set<string>();
  private ctl = { steer: 0, gas: 0, brake: 0, simple: true, cruise: 0 };
  private radio = new Radio();
  private nextEv: number;
  private visited = new Set<number>();
  private busy = false;
  private lastHud = '';
  private hint: HTMLDivElement;
  private riskEl: HTMLDivElement;
  private towT = 0;
  private hitchHelpT = 0;
  readonly trip: Trip;
  private combo: (typeof COMBOS)[number];
  private destName: string;

  constructor(
    private host: HaulHost,
    trip: Trip,
  ) {
    this.trip = trip;
    const dest = DESTS[trip.dest];
    this.destName = dest.name();
    this.combo = COMBOS[trip.combo];
    this.road = new Road(host.seed ^ (trip.dest * 7919), dest.km);
    const tier = host.tier;
    this.ahead = [320, 400, 560, 720][tier];
    // céu: o mesmo rig do garimpo usando um "mundo" daqui
    this.scene.fog = new THREE.Fog(0xcfd9c8, 60, 200);
    this.scene.background = new THREE.Color(0xcfd9c8);
    this.skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyU,
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float vY; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.45, vY)), 1.0); }',
      }),
    );
    this.skyMesh.renderOrder = -10;
    this.skyMesh.scale.setScalar(300);
    this.scene.add(this.skyMesh, this.hemi, this.sun, this.sun.target);
    const fake = { scene: this.scene, sun: this.sun, hemi: this.hemi, camera: this.camera, tier, skyU: this.skyU } as unknown as World;
    this.sky = new SkyRig(fake, tier, []);
    this.rain = new Rain([400, 600, 900, 1200][tier]);
    this.scene.add(this.rain.mesh);
    this.roadMat = new THREE.MeshLambertMaterial({ map: asphalt() });
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundDetailTexture() });
    this.haloMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd890, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 });
    // árvores (geometria de longe, uma InstancedMesh por espécie)
    setLod(1);
    const specs = [
      natureTree({ kind: 'broad', h: 9, trunk: '#6e4a2c', trunkDark: '#3e2614', leaf: '#4f9a35', leaf2: '#245a20', seed: 51, lod: 1 }),
      natureTree({ kind: 'acacia', h: 7.5, trunk: '#7a5a3a', trunkDark: '#4a3420', leaf: '#6a9a2a', leaf2: '#355a18', seed: 52, lod: 1 }),
      natureTree({ kind: 'palm', h: 10, trunk: '#8a7a5e', trunkDark: '#5a4a36', leaf: '#5aa83a', leaf2: '#2f6a24', seed: 53, lod: 1 }),
      natureTree({ kind: 'cloud', h: 12, trunk: '#7d6347', trunkDark: '#4a3826', leaf: '#3f8a30', leaf2: '#1f5222', seed: 54, lod: 1 }),
    ];
    const tmat = natureMat({ amp: 0.003, y0: 1.5 });
    const cap = [160, 260, 380, 520][tier];
    for (const g of specs) {
      const im = new THREE.InstancedMesh(g, tmat, cap);
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
      this.treeMeshes.push(im);
    }
    // cavalo + carretas
    setLod(tier <= 1 ? 1 : 0);
    this.tractor = buildTractor();
    this.scene.add(this.tractor);
    const n = this.combo.n;
    for (let i = 0; i < n; i++) {
      const tp = buildTrailer(this.combo.len, i === n - 1, i);
      this.scene.add(tp.root);
      this.trailers.push(tp);
    }
    this.rig = new Rig(this.road, n, this.combo.len);
    this.rig.loadT = trip.gold / 40;
    this.rig.dmg = trip.dmg;
    this.rig.onHit = (k) => {
      if (k >= 1) {
        sfx.crash();
        audio.fail();
      }
    };
    // faróis
    this.beams = new THREE.Group();
    for (const sx of [1, -1]) {
      const b = beam(11, 2.4);
      b.position.set(sx * 0.85, 1.45, 6.15);
      this.beams.add(b);
    }
    this.tractor.add(this.beams);
    if (tier >= 1) {
      this.spot = new THREE.SpotLight(0xfff0d0, 0, 70, 0.55, 0.5, 1);
      this.scene.add(this.spot, this.spot.target);
    }
    // trânsito (mão contrária)
    const cols = [0xd23a2a, 0xf3efe6, 0x2f6fbf, 0x3a3a44];
    for (let i = 0; i < [2, 3, 4, 4][tier]; i++) {
      const g = buildCar(cols[i % cols.length]);
      this.scene.add(g);
      this.cars.push({ g, s: 200 + i * 260, v: 19 + i * 2, lat: 1.9 });
    }
    // começo: pátio (engatar) ou retomada da viagem
    if (trip.coupled) {
      this.rig.coupled = true;
      this.rig.placeAt(trip.s, LANE);
    } else {
      // carretas paradas atrás, cavalo 7 m à frente (dar ré para engatar)
      this.rig.coupled = false;
      this.rig.placeAt(-YARD + 30 + n * this.combo.len + 10, LANE, 7);
    }
    this.nextEv = Math.max(400, trip.s + 500 + Math.random() * 400);
    for (const st of this.road.stops) if (st.s < trip.s) this.visited.add(st.s);
    this.yard();
    this.stream(true);
    this.syncMeshes();
    this.snapCam();
    // HUD
    this.hud = document.createElement('div');
    this.hud.className = 'hw-hud';
    this.hud.innerHTML = `
      <div class="hw-tl"><button class="hw-b hw-pause" data-touch-ignore>${RI.gear}</button></div>
      <div class="hw-tr"><button class="hw-b hw-cruise" data-touch-ignore>${RI.ff}</button><button class="hw-b hw-radio" data-touch-ignore>${RI.radio}</button><button class="hw-b hw-cam" data-touch-ignore>${RI.camera}</button></div>
      <div class="hw-prog"><div class="hw-line"></div><div class="hw-done"></div>${this.road.stops
        .map((st) => `<div class="hw-st" style="left:${((st.s / this.road.L) * 100).toFixed(1)}%">${RI[st.kind === 'station' ? 'pump' : st.kind === 'rest' ? 'bed' : st.kind === 'town' ? 'station' : 'flag']}</div>`)
        .join('')}<div class="hw-me">${RI.truck}</div><div class="hw-km"></div></div>
      <div class="hw-risk">${RI.no}<span>${t('gb.haul.risk', 'Solte o freio!')}</span></div>
      <div class="hw-hint" hidden></div>
      <div class="hw-dash"><div class="hw-gauge hw-fuel">${RI.fuel}<div class="hw-v"><i></i></div></div><div class="hw-spd"><b>0</b><small>km/h</small><em>A1</em></div><div class="hw-gauge hw-dmg">${RI.wrench}<div class="hw-v"><i></i></div></div></div>
      <div class="hw-pedals"><button class="hw-ped hw-brk" data-touch-ignore>${RI.no}<span>${t('gb.brake', 'Freio')}</span></button><button class="hw-ped hw-gas" data-touch-ignore>${RI.ff}<span>${t('gb.gas', 'Acelerar')}</span></button></div>`;
    host.root.appendChild(this.hud);
    this.hint = this.hud.querySelector('.hw-hint')!;
    this.riskEl = this.hud.querySelector('.hw-risk')!;
    const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
    const hold = (s: string, k: 'gas' | 'brake') =>
      this.btns.push(
        bindButton(q(s), {
          onPress: () => {
            this.held[k] = true;
            q(s).classList.add('on');
          },
          onRelease: () => {
            this.held[k] = false;
            q(s).classList.remove('on');
          },
        }),
      );
    hold('.hw-gas', 'gas');
    hold('.hw-brk', 'brake');
    this.btns.push(bindButton(q('.hw-pause'), { onPress: () => host.pause() }));
    this.btns.push(
      bindButton(q('.hw-cam'), {
        onPress: () => {
          this.camMode = (this.camMode + 1) % 3;
          sfx.click();
        },
      }),
    );
    this.btns.push(
      bindButton(q('.hw-radio'), {
        onPress: () => {
          const st = this.radio.next();
          q('.hw-radio').classList.toggle('on', st > 0);
          notify(st === 0 ? t('gb.haul.radioOff', 'Rádio desligado') : st === 1 ? t('gb.haul.radio1', 'Rádio Sertaneja FM') : t('gb.haul.radio2', 'Rádio Forró da Estrada'), { icon: 'music' });
        },
      }),
    );
    this.btns.push(
      bindButton(q('.hw-cruise'), {
        onPress: () => {
          if (this.ctl.cruise > 0) this.ctl.cruise = 0;
          else if (this.rig.v > 5) this.ctl.cruise = this.rig.v;
          else this.ctl.cruise = 0;
          q('.hw-cruise').classList.toggle('on', this.ctl.cruise > 0);
          sfx.click();
          if (this.ctl.cruise > 0) notify(t('gb.haul.cruiseOn', 'Piloto automático: {n} km/h', { n: Math.round(this.ctl.cruise * 3.6) }), { icon: 'clock' });
        },
      }),
    );
    this.joy = createJoystick(host.root, { zone: (x, y, r) => x < r.width * 0.42 && y > r.height * 0.22, deadZone: 0.08 });
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    if (!trip.coupled) window.setTimeout(() => host.say(t('gb.haul.tipHitch', 'Dê ré devagar até encaixar na carreta. Segure o FREIO para ir de ré!')), 600);
  }

  private kd = (e: KeyboardEvent) => this.keys.add(e.code);
  private ku = (e: KeyboardEvent) => this.keys.delete(e.code);

  /** pátio: chão de concreto, galpão e placa */
  private yard(): void {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(40, YARD + 40), new THREE.MeshLambertMaterial({ color: 0x9a968c }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.01, -YARD / 2 - 10);
    g.add(pad);
    const shed = buildShop(0xe8e0d0, 0xf2b20f);
    shed.scale.setScalar(1.6);
    shed.position.set(-17, 0, -YARD / 2);
    shed.rotation.y = Math.PI / 2;
    g.add(shed);
    const sign = buildSign([t('gb.haul.yard', 'Pátio do Garimpo'), `→ ${this.destName}`]);
    sign.position.set(9, 0, -20);
    g.add(sign);
    // montinho de concentrado (decoração)
    const pile = new THREE.Mesh(new THREE.ConeGeometry(6, 4, 10), new THREE.MeshLambertMaterial({ color: 0x8a5a32 }));
    pile.position.set(-13, 2, -YARD + 25);
    g.add(pile);
    this.scene.add(g);
  }

  /* ---------------- pedaços ---------------- */
  private stream(force = false): void {
    const s = this.rig.s;
    const i0 = Math.floor((s + YARD) / CH) - 1;
    const i1 = Math.floor((s + YARD + this.ahead) / CH);
    let changed = force;
    for (const [i, c] of this.chunks)
      if (i < i0 || i > i1) {
        this.drop(c);
        this.chunks.delete(i);
        changed = true;
      }
    for (let i = Math.max(0, i0); i <= i1; i++) {
      if (this.chunks.has(i)) continue;
      if (i * CH - YARD > this.road.L + 240) continue;
      this.chunks.set(i, this.build(i));
      changed = true;
      // no máximo um pedaço novo por quadro (sem engasgo), menos no começo
      if (!force) break;
    }
    if (changed) this.fillTrees();
  }
  private drop(c: Chunk): void {
    c.grp.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m as unknown as THREE.Sprite).isSprite) m.geometry.dispose();
    });
    this.scene.remove(c.grp);
  }
  private fillTrees(): void {
    const n = this.treeMeshes.map(() => 0);
    for (const c of this.chunks.values())
      c.trees.forEach((list, k) => {
        const im = this.treeMeshes[k];
        for (const m of list) {
          if (n[k] >= im.instanceMatrix.count) break;
          im.setMatrixAt(n[k]++, m);
        }
      });
    this.treeMeshes.forEach((im, k) => {
      im.count = n[k];
      im.instanceMatrix.needsUpdate = true;
    });
  }

  private build(ci: number): Chunk {
    const road = this.road;
    const grp = new THREE.Group();
    const sA = ci * CH - YARD;
    const rows = CH / DS + 1;
    const o = P5;
    let rnd = (this.road.seed ^ (ci * 9301 + 49297)) >>> 0 || 1;
    const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    // ---- asfalto ----
    {
      const pos = new Float32Array(rows * 2 * 3);
      const uv = new Float32Array(rows * 2 * 2);
      const idx: number[] = [];
      for (let r = 0; r < rows; r++) {
        const s = sA + r * DS;
        road.sample(s, o);
        const cx = Math.cos(o[3]);
        const sz = -Math.sin(o[3]);
        for (let k = 0; k < 2; k++) {
          const lat = k === 0 ? HALF : -HALF;
          pos.set([o[0] + cx * lat, o[1] + 0.03, o[2] + sz * lat], (r * 2 + k) * 3);
          uv.set([k === 0 ? 0 : 1, s / 12], (r * 2 + k) * 2);
        }
        if (r < rows - 1) {
          const a = r * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.roadMat);
      m.receiveShadow = false;
      grp.add(m);
    }
    // ---- chão dos dois lados ----
    {
      const OFF = [HALF - 0.05, HALF + 0.7, SHOULDER, 11, 17, 26, 40, 62, 95];
      const nc = OFF.length * 2;
      const pos = new Float32Array(rows * nc * 3);
      const col = new Float32Array(rows * nc * 3);
      const uv = new Float32Array(rows * nc * 2);
      const idx: number[] = [];
      const c = new THREE.Color();
      for (let r = 0; r < rows; r++) {
        const s = sA + r * DS;
        road.sample(s, o);
        const cx = Math.cos(o[3]);
        const sz = -Math.sin(o[3]);
        for (let side = 0; side < 2; side++)
          for (let k = 0; k < OFF.length; k++) {
            const lat = (side === 0 ? 1 : -1) * OFF[k];
            const y = s < 0 && Math.abs(lat) < 22 ? -0.02 : road.ground(s, lat, o[1]);
            const vi = r * nc + side * OFF.length + k;
            const x = o[0] + cx * lat;
            const z = o[2] + sz * lat;
            pos.set([x, y, z], vi * 3);
            uv.set([x / 9, z / 9], vi * 2);
            const nz = Math.sin(x * 0.07) * Math.sin(z * 0.05);
            if (k <= 1) c.setRGB(1.25, 1.12, 0.95);
            else if (s < 0 && Math.abs(lat) < 22) c.setRGB(1.2, 1.18, 1.1);
            else if (k === 2) c.setRGB(1.3, 0.85, 0.55);
            else c.setRGB(0.62 + nz * 0.12, 1.05 + nz * 0.15 - k * 0.02, 0.42 + nz * 0.06);
            // barranco perto do rio: terra
            if (y < o[1] - 3) c.setRGB(1.1, 0.75, 0.5);
            col.set([c.r, c.g, c.b], vi * 3);
            if (r < rows - 1 && k < OFF.length - 1) {
              const a = vi;
              const b = vi + 1;
              const a2 = a + nc;
              const b2 = b + nc;
              if (side === 0) idx.push(a, a2, b, b, a2, b2);
              else idx.push(a, b, a2, b, b2, a2);
            }
          }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      grp.add(new THREE.Mesh(g, this.groundMat));
    }
    // ---- miudezas: balizadores, pontes, paradas (uma malha de cor por vértice) ----
    const parts: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry: number, sx = 1, sy = 1, sz = 1) => {
      const gg = geo.index ? geo.toNonIndexed() : geo;
      _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, sy, sz));
      gg.applyMatrix4(_m);
      const n = gg.attributes.position.count;
      const cc = new Float32Array(n * 3);
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) cc.set([c.r, c.g, c.b], i * 3);
      gg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      gg.deleteAttribute('uv');
      parts.push(gg);
    };
    const post = new THREE.BoxGeometry(0.14, 1.0, 0.14);
    for (let s = Math.ceil(sA / 25) * 25; s < sA + CH; s += 25) {
      if (s < 10 || road.bridgeAt(s) || road.stopAt(s, 60)) continue;
      road.sample(s, o);
      for (const lat of [SHOULDER - 0.4, -(SHOULDER - 0.4)]) {
        const x = o[0] + Math.cos(o[3]) * lat;
        const z = o[2] - Math.sin(o[3]) * lat;
        add(post.clone(), 0xf3efe6, x, o[1] + 0.3, z, o[3]);
        add(new THREE.BoxGeometry(0.16, 0.18, 0.16), lat > 0 ? 0xffb02e : 0xd23a2a, x, o[1] + 0.75, z, o[3]);
      }
    }
    // pontes
    for (const br of road.bridges) {
      if (br.s1 < sA - 20 || br.s0 > sA + CH + 20) continue;
      const a = Math.max(sA, br.s0 - 6);
      const b = Math.min(sA + CH, br.s1 + 6);
      for (let s = a; s < b; s += 4) {
        road.sample(s + 2, o);
        // tabuleiro e guarda-corpo
        add(new THREE.BoxGeometry(HALF * 2 + 1.2, 0.8, 4.05), 0x9a968c, o[0], o[1] - 0.42, o[2], o[3]);
        for (const lat of [HALF + 0.4, -HALF - 0.4]) {
          add(new THREE.BoxGeometry(0.3, 0.9, 4.05), 0xd8d4c8, o[0] + Math.cos(o[3]) * lat, o[1] + 0.45, o[2] - Math.sin(o[3]) * lat, o[3]);
          add(new THREE.BoxGeometry(0.12, 0.12, 4.05), 0xf2b20f, o[0] + Math.cos(o[3]) * lat, o[1] + 0.95, o[2] - Math.sin(o[3]) * lat, o[3]);
        }
      }
      // pilares
      for (let s = br.s0 + 10; s < br.s1 - 4; s += 16) {
        if (s < sA || s >= sA + CH) continue;
        road.sample(s, o);
        add(new THREE.CylinderGeometry(0.8, 1, 9, 8), 0x8a867c, o[0], o[1] - 5.2, o[2], o[3]);
      }
      // rio
      const m = (br.s0 + br.s1) / 2;
      if (m >= sA && m < sA + CH) {
        road.sample(m, o);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(36, 220), this.waterMat);
        w.rotation.set(-Math.PI / 2, 0, o[3] + Math.PI / 2);
        w.position.set(o[0], o[1] - 6.6, o[2]);
        grp.add(w);
      }
    }
    // paradas
    const trees: THREE.Matrix4[][] = this.treeMeshes.map(() => []);
    for (const st of road.stops) {
      if (st.s < sA - 40 || st.s >= sA + CH - 40) continue;
      if (st.s < sA) continue;
      this.stopProps(st, grp);
    }
    // placas antes das paradas e do destino
    for (const st of road.stops) {
      const ps = st.s - 320;
      if (ps < sA || ps >= sA + CH) continue;
      road.sample(ps, o);
      const lines = st.kind === 'dest' ? [this.destName, '300 m'] : st.kind === 'station' ? [t('gb.haul.sign.station', 'Posto'), '300 m'] : st.kind === 'rest' ? [t('gb.haul.sign.rest', 'Parada de descanso'), '300 m'] : [NAMES[st.name], '300 m'];
      const sg = buildSign(lines);
      sg.position.set(o[0] + Math.cos(o[3]) * -(SHOULDER + 1.5), o[1], o[2] - Math.sin(o[3]) * -(SHOULDER + 1.5));
      sg.rotation.y = o[3] + Math.PI;
      grp.add(sg);
    }
    // árvores
    const dens = [0.3, 0.45, 0.6, 0.75][this.host.tier];
    for (let s = sA; s < sA + CH; s += 6) {
      if (s < 0) continue;
      if (R() > dens) continue;
      const lat = (R() < 0.5 ? 1 : -1) * (14 + R() * 70);
      if (road.stopAt(s, 70) && Math.abs(lat) < 40) continue;
      if (road.bridgeAt(s) || road.bridges.some((b) => s > b.s0 - 30 && s < b.s1 + 30)) continue;
      road.sample(s, o);
      const x = o[0] + Math.cos(o[3]) * lat;
      const z = o[2] - Math.sin(o[3]) * lat;
      const y = road.ground(s, lat, o[1]);
      const k = Math.floor(R() * this.treeMeshes.length);
      const sc = 0.7 + R() * 0.6;
      trees[k].push(new THREE.Matrix4().compose(_v.set(x, y - 0.1, z), _q.setFromEuler(_e.set(0, R() * 6.28, 0)), _v2.set(sc, sc, sc)));
    }
    if (parts.length) {
      // junta tudo numa malha
      let n = 0;
      for (const p of parts) n += p.attributes.position.count;
      const P = new Float32Array(n * 3);
      const N = new Float32Array(n * 3);
      const C = new Float32Array(n * 3);
      let off = 0;
      for (const p of parts) {
        if (!p.attributes.normal) p.computeVertexNormals();
        P.set(p.attributes.position.array as Float32Array, off * 3);
        N.set(p.attributes.normal.array as Float32Array, off * 3);
        C.set(p.attributes.color.array as Float32Array, off * 3);
        off += p.attributes.position.count;
        p.dispose();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      grp.add(new THREE.Mesh(g, this.miscMat));
    }
    post.dispose();
    this.scene.add(grp);
    return { i: ci, grp, trees };
  }

  /** posto / parada / cidade / destino ao lado da pista */
  private stopProps(st: Stop, grp: THREE.Group): void {
    const o = P5;
    this.road.sample(st.s, o);
    const side = st.side;
    const h = o[3];
    const at = (lat: number, along: number, obj: THREE.Object3D, rot = 0) => {
      this.road.sample(st.s + along, o);
      obj.position.set(o[0] + Math.cos(o[3]) * lat * side, o[1], o[2] - Math.sin(o[3]) * lat * side);
      obj.rotation.y = o[3] + rot;
      grp.add(obj);
    };
    // pátio de chão batido
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(26, 90), new THREE.MeshLambertMaterial({ color: st.kind === 'dest' ? 0x9a968c : 0x8a8478 }));
    pad.rotation.x = -Math.PI / 2;
    this.road.sample(st.s, o);
    pad.position.set(o[0] + Math.cos(h) * (HALF + 13) * side, o[1] + 0.02, o[2] - Math.sin(h) * (HALF + 13) * side);
    pad.rotation.z = h;
    grp.add(pad);
    const lamp = (lat: number, along: number) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), this.miscMat);
      at(lat, along, p);
      p.position.y += 3;
      const hs = new THREE.Sprite(this.haloMat);
      hs.scale.setScalar(4);
      at(lat, along, hs);
      hs.position.y += 6.1;
    };
    if (st.kind === 'station') {
      at(HALF + 12, 0, buildPump(), Math.PI / 2);
      at(HALF + 23, 18, buildShop(0xf3efe6, 0x2fa84a), side > 0 ? Math.PI / 2 : -Math.PI / 2);
      lamp(HALF + 3, -25);
      lamp(HALF + 3, 25);
    } else if (st.kind === 'rest') {
      at(HALF + 20, 0, buildShop(0xe8c27a, 0xd23a2a), side > 0 ? Math.PI / 2 : -Math.PI / 2);
      at(HALF + 12, 30, buildPump(), Math.PI / 2);
      lamp(HALF + 3, -30);
      lamp(HALF + 3, 0);
      lamp(HALF + 3, 30);
    } else if (st.kind === 'town') {
      const cols = [0xe8c27a, 0x9ad0e8, 0xf3efe6, 0xe89a8a, 0xb8e08a];
      for (let i = 0; i < 5; i++) {
        at(HALF + 16 + (i % 2) * 4, -50 + i * 25, buildShop(cols[i], cols[(i + 2) % 5]), side > 0 ? Math.PI / 2 : -Math.PI / 2);
        const other = buildShop(cols[(i + 1) % 5], cols[(i + 3) % 5]);
        at(-(HALF + 18), -40 + i * 22, other, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (let i = 0; i < 4; i++) lamp(HALF + 2.5, -45 + i * 30);
    } else {
      // destino: galpão grande + bandeira
      const big = buildShop(0xd8d4c8, 0xf2b20f);
      big.scale.set(2.4, 2, 2.4);
      at(HALF + 26, 0, big, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const sg = buildSign([this.destName, t('gb.haul.unload', 'Descarga')]);
      at(HALF + 6, -30, sg, Math.PI);
      for (let i = 0; i < 3; i++) lamp(HALF + 3, -30 + i * 30);
    }
  }

  /* ---------------- quadro ---------------- */
  private stepInput(dt: number): void {
    const K = this.keys;
    const j = this.joy.read();
    let st = j.x;
    if (K.has('ArrowLeft') || K.has('KeyA')) st = -1;
    if (K.has('ArrowRight') || K.has('KeyD')) st = 1;
    const ramp = (v: number, on: boolean) => (on ? Math.min(1, v + dt * 3) : Math.max(0, v - dt * 6));
    this.ctl.gas = ramp(this.ctl.gas, this.held.gas || K.has('ArrowUp') || K.has('KeyW'));
    this.ctl.brake = ramp(this.ctl.brake, this.held.brake || K.has('ArrowDown') || K.has('KeyS') || K.has('Space'));
    this.ctl.steer = st;
    this.ctl.simple = !this.host.expert();
    if (this.ctl.brake > 0.2 && this.ctl.cruise > 0) {
      this.ctl.cruise = 0;
      this.hud.querySelector('.hw-cruise')!.classList.remove('on');
    }
    // sem diesel: motor apaga
    if (this.host.fuelOn && this.trip.fuel <= 0) this.ctl.gas = 0;
    // danificado: anda devagar
    if (this.rig.dmg > 70 && this.rig.v > 14) this.ctl.gas = Math.min(this.ctl.gas, 0.2);
  }

  /** um quadro: true = continua; a pausa/cartões param a simulação */
  frame(dt: number, paused: boolean): void {
    this.time += dt;
    if (!paused && !this.busy) {
      this.stepInput(dt);
      const h = 1 / 60;
      let left = dt;
      while (left > 1e-4) {
        const d = Math.min(h, left);
        this.rig.step(d, this.ctl);
        left -= d;
      }
      this.trip.s = this.rig.s;
      this.trip.dmg = this.rig.dmg;
      if (weather.isNight) this.trip.night += dt;
      // diesel
      if (this.host.fuelOn && this.rig.v > 0.1) {
        const r = (Math.abs(this.rig.v) / 1000) * (10 + this.rig.massT * 0.35) * (0.45 + 0.55 * this.ctl.gas) * [0, 0.85, 1, 1.25][this.host.diff];
        this.trip.fuel = Math.max(0, this.trip.fuel - r * dt - 0.002 * dt);
      }
      this.logic(dt);
    }
    this.syncMeshes();
    this.cameraStep(dt);
    this.traffic(dt);
    this.stream();
    // céu
    this.sky.apply(dt, this.camera, [], null, null, weather.rain, this.time);
    this.skyMesh.position.copy(this.camera.position);
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.rain.update(this.time, this.camPos, weather.rain);
    const dark = this.sky.dark;
    beamU.uK.value = dark;
    this.beams.visible = dark > 0.05;
    this.haloMat.opacity = Math.max(0, Math.min(1, (dark - 0.15) * 1.6)) * 0.85;
    if (this.spot) {
      this.spot.intensity = dark > 0.05 ? 90 * dark : 0;
      const tr = this.rig.tr;
      this.spot.position.set(tr.x + Math.sin(tr.yaw) * 6.3, tr.y + 1.6, tr.z + Math.cos(tr.yaw) * 6.3);
      this.spot.target.position.set(tr.x + Math.sin(tr.yaw) * 30, tr.y - 1, tr.z + Math.cos(tr.yaw) * 30);
    }
    audio.engineSet(Math.max(this.ctl.gas, 0.15), Math.min(1, 0.2 + Math.abs(this.rig.v) / 30));
    this.hudStep();
  }

  /** paradas, engate, eventos, guincho */
  private logic(dt: number): void {
    const rig = this.rig;
    const st = this.road.stopAt(rig.s, 55);
    const acts: Parameters<HaulHost['actions']>[0] = [];
    const slow = Math.abs(rig.v) < 1.5;
    // engatar
    this.hint.hidden = true;
    if (!rig.coupled) {
      const [gap, ang] = rig.hitchGap();
      this.hitchHelpT -= dt;
      if (Math.abs(gap) < 9) {
        this.hint.hidden = false;
        const k = Math.max(-1, Math.min(1, gap / 6));
        const key = `${Math.round(gap * 10)}|${Math.round(ang * 20)}`;
        if (this.hint.dataset.k !== key) {
          this.hint.dataset.k = key;
          this.hint.innerHTML = `${RI.hitch}<div class="hw-gapm"><i><em></em><u style="left:${(50 + k * 50).toFixed(0)}%"></u></i><span>${Math.abs(gap).toFixed(1)} m</span></div>${Math.abs(ang) > 0.25 ? RI.no : RI.check}`;
        }
      }
      // simples: ajuda a alinhar na ré
      if (this.ctl.simple && rig.v < -0.2 && Math.abs(gap) < 9) {
        const u = rig.tl[0];
        let d = u.yaw - rig.tr.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        rig.tr.yaw += d * Math.min(1, dt * 1.5);
        // e puxa para a linha da carreta
        const kx = u.x + Math.sin(u.yaw) * u.len;
        const kz = u.z + Math.cos(u.yaw) * u.len;
        const lx = Math.cos(u.yaw);
        const lz = -Math.sin(u.yaw);
        const off = (rig.tr.x - kx) * lx + (rig.tr.z - kz) * lz;
        rig.tr.x -= lx * off * Math.min(1, dt * 2);
        rig.tr.z -= lz * off * Math.min(1, dt * 2);
      }
      if (Math.abs(gap) < 0.9 && Math.abs(ang) < 0.3 && slow) {
        acts.push({ id: 'hitch', icon: 'hitch', label: t('gb.haul.hitch', 'Engatar'), cls: 'green', run: () => this.couple() });
      } else if (gap < -0.9 && gap > -4) {
        // passou do ponto
        if (this.hitchHelpT <= 0) {
          this.hitchHelpT = 4;
          notify(t('gb.haul.tooFar', 'Passou! Ande um pouquinho para a frente.'), { icon: 'warning' });
        }
      }
    }
    // paradas
    if (st && slow && rig.coupled) {
      if ((st.kind === 'station' || st.kind === 'rest') && this.host.fuelOn) {
        const need = Math.max(0, RIG_TANK - this.trip.fuel);
        const price = Math.ceil(need * this.host.dieselPrice);
        if (need > 5) acts.push({ id: 'fuel', icon: 'pump', label: t('gb.rp.refuel', 'Abastecer'), sub: ['coin', String(price)], run: () => this.refuel() });
      }
      if (st.kind !== 'dest') {
        acts.push({ id: 'eat', icon: 'food', label: t('gb.rp.eat', 'Comer'), sub: ['coin', '25'], run: () => this.host.eat() });
        if (st.kind === 'rest' || st.kind === 'town') acts.push({ id: 'sleep', icon: 'bed', label: weather.isNight || this.host.energyLow() ? t('gb.rp.sleep', 'Dormir') : t('gb.rp.rest', 'Descansar'), cls: 'blue', run: () => void this.host.sleep(weather.isNight || this.host.energyLow() ? null : 1) });
        const nx = this.road.nextStop(rig.s);
        if (nx) acts.push({ id: 'skip', icon: 'ff', label: t('gb.haul.skip', 'Pular até a próxima parada'), cls: 'blue', run: () => void this.skip(nx) });
      }
    }
    if (rig.coupled && rig.s > this.road.L - 45 && slow) acts.push({ id: 'deliver', icon: 'box', label: t('gb.haul.deliver', 'Desengatar e entregar'), cls: 'green', run: () => this.host.arrive() });
    if (this.host.fuelOn && this.trip.fuel <= 0 && slow) acts.push({ id: 'tow', icon: 'sos', label: t('gb.rp.callHelp', 'Chamar socorro'), sub: ['coin', String(this.towFee())], run: () => this.tow(true) });
    this.host.actions(acts);
    // eventos pelo caminho
    if (rig.coupled && rig.s > this.nextEv && !this.busy && rig.s < this.road.L - 300) {
      this.nextEv = rig.s + 700 + Math.random() * 600;
      void this.runEvent({ loc: 'road', veh: 'rig' });
    }
    if (st && st.kind === 'town' && !this.visited.has(st.s) && rig.coupled) {
      this.visited.add(st.s);
      if (Math.random() < 0.7) void this.runEvent({ loc: 'town', veh: 'rig' });
    }
    // engavetou / saiu longe da pista → guincho
    if (rig.jack || Math.abs(rig.lat) > 18) {
      this.towT += dt;
      if (this.towT > 1.6) {
        this.towT = 0;
        if (rig.jack) notify(t('gb.haul.jack', 'Engavetou! O guincho vai endireitar a carreta.'), { icon: 'warning', kind: 'bad' });
        this.tow(false);
      }
    } else this.towT = 0;
  }
  private async runEvent(c: Partial<Ctx>): Promise<void> {
    this.busy = true;
    this.ctl.gas = 0;
    await this.host.event(c);
    this.busy = false;
  }
  towFee(): number {
    return Math.round([60, 150, 220, 320][this.host.diff]);
  }
  /** guincho: alinha tudo na faixa (custa e leva tempo) */
  tow(paid: boolean): void {
    const rig = this.rig;
    if (paid && !this.host.spend(this.towFee())) {
      notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
      return;
    }
    weather.advance(paid ? 1.5 : 0.8);
    rig.placeAt(Math.max(5, rig.s), LANE);
    if (paid) this.trip.fuel = Math.max(this.trip.fuel, 60);
    if (!paid) this.host.spend(Math.round(this.towFee() * 0.5));
    sfx.thunk();
  }
  private couple(): void {
    const rig = this.rig;
    rig.coupled = true;
    this.trip.coupled = true;
    // ajusta o cavalo exatamente no pino
    const u = rig.tl[0];
    rig.tr.yaw = u.yaw;
    rig.tr.x = u.x + Math.sin(u.yaw) * (u.len - 0.35);
    rig.tr.z = u.z + Math.cos(u.yaw) * (u.len - 0.35);
    rig.v = 0;
    sfx.thunk();
    sfx.fix();
    this.host.say(t('gb.haul.coupled', 'Engatado! Agora é estrada. Boa viagem!'));
  }
  private refuel(): void {
    const need = Math.max(0, RIG_TANK - this.trip.fuel);
    const price = Math.ceil(need * this.host.dieselPrice);
    if (!this.host.spend(price)) {
      // abastece o que der
      const can = Math.floor(this.host.money() / Math.max(0.01, this.host.dieselPrice));
      if (can <= 0) {
        notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
        return;
      }
      this.host.spend(Math.ceil(can * this.host.dieselPrice));
      this.trip.fuel += can;
    } else this.trip.fuel = RIG_TANK;
    sfx.water();
    audio.coin(1);
  }
  /** pular trecho: o caminhão "viaja" sozinho até a próxima parada (gasta diesel e tempo) */
  private async skip(nx: Stop): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const dist = nx.s - 40 - this.rig.s;
    const fuel = (dist / 1000) * (10 + this.rig.massT * 0.35) * 0.75 * [0, 0.85, 1, 1.25][this.host.diff];
    if (this.host.fuelOn && fuel > this.trip.fuel) {
      notify(t('gb.haul.noFuelSkip', 'Diesel não dá até lá: abasteça antes!'), { icon: 'warning', kind: 'warn' });
      this.busy = false;
      return;
    }
    const hours = dist / 1000 / 70;
    await this.host.sleep(-hours);
    if (this.host.fuelOn) this.trip.fuel -= fuel;
    this.rig.placeAt(nx.s - 40, LANE);
    this.nextEv = this.rig.s + 400;
    this.visited.add(nx.s);
    this.stream(true);
    this.snapCam();
    this.busy = false;
  }

  private syncMeshes(): void {
    const rig = this.rig;
    const t0 = rig.tr;
    this.tractor.position.set(t0.x, t0.y, t0.z);
    this.tractor.rotation.set(t0.pitch, t0.yaw, 0, 'YXZ');
    rig.tl.forEach((u, i) => {
      const tp = this.trailers[i];
      tp.root.position.set(u.x, u.y, u.z);
      tp.root.rotation.set(u.pitch, u.yaw, 0, 'YXZ');
      tp.load.scale.y = Math.max(0.05, Math.min(1, rig.loadT / (this.combo.cap || 1)));
      tp.load.visible = rig.loadT > 0.3;
    });
  }

  private snapCam(): void {
    this.camYaw = this.rig.tr.yaw;
    this.cameraStep(1, true);
  }
  private cameraStep(dt: number, snap = false): void {
    const rig = this.rig;
    const t0 = rig.tr;
    const n = rig.coupled ? rig.tl.length : 0;
    // guinada: entre o cavalo e a 1ª carreta (as carretas aparecem na curva)
    let want = t0.yaw;
    if (n) {
      let d = rig.tl[0].yaw - t0.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      want += d * 0.5;
    }
    if (rig.v < -0.3) want = rig.tl[0] ? rig.tl[0].yaw : t0.yaw;
    let d = want - this.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += snap ? d : d * Math.min(1, dt * 2.2);
    const cam = this.camera;
    if (this.camMode === 2) {
      // cabine
      _v.set(t0.x + Math.sin(t0.yaw) * 5.2, t0.y + 3.25, t0.z + Math.cos(t0.yaw) * 5.2);
      cam.position.copy(_v);
      this.camPos.copy(_v);
      cam.lookAt(t0.x + Math.sin(t0.yaw) * 40, t0.y + 1.5 + Math.sin(t0.pitch) * -20, t0.z + Math.cos(t0.yaw) * 40);
      this.tractor.visible = false;
      return;
    }
    this.tractor.visible = true;
    const far = this.camMode === 1;
    const dist = (far ? 26 : 13) + n * (far ? 5 : 2.6) + (rig.coupled ? 0 : 4);
    const hgt = (far ? 14 : 5.6) + n * (far ? 2 : 0.8) + (rig.coupled ? 0 : 3);
    const look = rig.coupled ? 4 : -4;
    const tx = t0.x + Math.sin(t0.yaw) * look;
    const tz = t0.z + Math.cos(t0.yaw) * look;
    const ty = t0.y + 2.4;
    let cx = tx - Math.sin(this.camYaw) * dist;
    let cz = tz - Math.cos(this.camYaw) * dist;
    // nunca dentro do morro
    const pr = { s: 0, lat: 0 };
    this.road.project(cx, cz, rig.s - dist, pr);
    this.road.sample(pr.s, P5);
    const gy = this.road.ground(pr.s, pr.lat, P5[1]);
    let cy = Math.max(ty + hgt, gy + 2.5);
    const k = snap ? 1 : Math.min(1, dt * 4);
    this.camPos.x += (cx - this.camPos.x) * k;
    this.camPos.y += (cy - this.camPos.y) * k;
    this.camPos.z += (cz - this.camPos.z) * k;
    cam.position.copy(this.camPos);
    this.camLook.set(tx, ty, tz);
    cam.lookAt(this.camLook);
    void cx;
    void cy;
    cx = cz = cy = 0;
  }

  private traffic(dt: number): void {
    const o = P5;
    for (const c of this.cars) {
      c.s -= c.v * dt;
      if (c.s < this.rig.s - 60) c.s = this.rig.s + this.ahead * 0.9 + Math.random() * 120;
      const near = this.road.stopAt(c.s, 60);
      this.road.sample(c.s, o);
      const lat = near ? 1.9 : c.lat;
      c.g.position.set(o[0] + Math.cos(o[3]) * lat, o[1], o[2] - Math.sin(o[3]) * lat);
      c.g.rotation.y = o[3] + Math.PI;
      c.g.visible = c.s > 30 && c.s < this.road.L + 100;
    }
  }

  private hudStep(): void {
    const rig = this.rig;
    const L = this.road.L;
    const kmh = Math.round(Math.abs(rig.v) * 3.6);
    const fuelK = this.trip.fuel / RIG_TANK;
    const prog = Math.max(0, Math.min(1, rig.s / L));
    const key = `${kmh}|${rig.gear}|${Math.round(fuelK * 50)}|${Math.round(prog * 400)}|${Math.round(rig.dmg)}|${this.ctl.cruise > 0}`;
    if (key !== this.lastHud) {
      this.lastHud = key;
      const q = (s: string) => this.hud.querySelector(s) as HTMLElement;
      q('.hw-spd b').textContent = String(kmh);
      q('.hw-spd em').textContent = rig.gear < 0 ? 'R' : (this.ctl.cruise > 0 ? '⏵ ' : 'A') + rig.gear;
      (q('.hw-fuel i') as HTMLElement).style.height = Math.round(fuelK * 100) + '%';
      q('.hw-fuel').classList.toggle('low', this.host.fuelOn && fuelK < 0.12);
      q('.hw-fuel').hidden = !this.host.fuelOn;
      (q('.hw-dmg i') as HTMLElement).style.height = Math.round(100 - rig.dmg) + '%';
      q('.hw-done').style.width = (prog * 100).toFixed(1) + '%';
      q('.hw-me').style.left = (prog * 100).toFixed(1) + '%';
      q('.hw-km').textContent = Math.max(0, (L - rig.s) / 1000).toFixed(1) + ' km';
    }
    this.riskEl.classList.toggle('on', rig.risk > 0.35);
  }

  setVisible(on: boolean): void {
    this.hud.hidden = !on;
    this.joy.setEnabled(on);
    if (!on) this.held.gas = this.held.brake = false;
  }

  render(r: THREE.WebGLRenderer, W: number, H: number): void {
    this.camera.aspect = W / H;
    this.camera.fov = W / H < 1.2 ? 70 : 58;
    this.camera.far = 420;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.radio.stop();
    for (const b of this.btns) b.destroy();
    this.joy.destroy();
    this.hud.remove();
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
    this.sky.dispose();
    this.rain.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
