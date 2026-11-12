/* ============================================================
 *  ANOMALIAS & CIA — ABERTURA (≈41 s, "Pular" sempre visível; base: src/3d/cine).
 *  Toca no primeiro turno e pode ser revista pelo menu (playIntro). Fofo-assustador, sem susto.
 *   1. Noite de chuva: o prédio da Anomalias & Cia, letreiro de neon piscando, poste com halo.
 *   2. O SEU Bloop chega pela calçada com a lanterna; o crachá novinho aparece (cartão).
 *   3. Saguão: o chefe (bigode, cartola, óculos) entrega as chaves e a câmera polaroide
 *      ("fotografe tudo que estiver estranho!") e vai embora acenando.
 *   4. Corredor: as luzes piscam, um quadro entorta sozinho... o Bloop ergue a câmera:
 *      FLASH e a polaroide sai deslizando com a foto da cena.
 *   5. A sombra do Bocudo passa pela parede atrás do Bloop; ele vira... não tem ninguém!
 *   6. Lá fora: grua até o letreiro que acende de vez; o Bocudo espia da esquina → título.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { detectInitialTier } from '../../../core/quality';
import { music } from '../../../audio';
import { MODES } from '../../../audio/music/player';
import { displayName } from '../../../services/leaderboard';
import { mySpec, npcSpec, PaperChar } from '../../../3d/paper';
import { Cine, bump, ease, ease5, easeBack, easeOut, flicker, glowTex, lerp, registerTheme, seg, TAU, type Stage3D } from '../../../3d/cine';
import { Bocudo } from '../core/models';
import { AnoAudio } from '../core/audio';
import { IC } from '../core/icons';

registerTheme({
  id: 'anomaliasIntro',
  name: 'Anomalias — Abertura (primeiro turno)',
  bpm: 84,
  root: 57,
  mode: MODES.minor,
  prog: [0, 5, 3, 4],
  seed: 4242,
  db: 0.6,
  parts: [
    { role: 'drone', inst: 'padDark', vol: 0.8, len: 32, st: { calm: 1, tension: 1, victory: 0.5 } },
    { role: 'arp', inst: 'musicbox', vol: 0.65, oct: 1, pat: 'x..x..x.x..x..x.', order: [0, 2, 1, 2], st: { calm: 1, tension: 0.7, victory: 1 } },
    { role: 'bass', inst: 'pluckBass', vol: 0.7, pat: 'x...x...x...x...', st: { calm: 1, tension: 1, victory: 1 } },
    { role: 'perc', inst: 'rim', vol: 0.45, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 0.8, tension: 1 } },
    { role: 'lead', inst: 'vibes', vol: 0.55, oct: 1, dens: 0.3, st: { calm: 0.9, victory: 1 } },
    { role: 'perc', inst: 'lowTom', vol: 0.55, pat: 'x.......x.....x.', st: { tension: 1 } },
    { role: 'pad', inst: 'strings', vol: 0.5, len: 8, st: { tension: 1, victory: 0.6 } },
    { role: 'pad', inst: 'choir', vol: 0.5, len: 16, st: { victory: 1 } },
    { role: 'perc', inst: 'snap', vol: 0.6, pat: '....x.......x...', st: { victory: 1 } },
    { role: 'bell', inst: 'bell', vol: 0.45, oct: 2, len: 4, st: { victory: 1 } },
  ],
});

/* ------------------------------ roteiro (s) ------------------------------ */
const T_WALK = 5.5;
const T_BADGE = 8.2;
const T_LOBBY = 12;
const T_GIVE = 14.2;
const T_BYE = 17.6;
const T_HALL = 20;
const T_TILT = 22;
const T_SNAP = 24.2;
const T_SHADOW = 27;
const T_TURN = 29.8;
const T_OUT = 32.5;
const T_TITLE = 35.2;
const T_END = 41;
/** interior fica longe do exterior (cortes) */
const IX = 200;

const ic = (h: string) => `<span style="display:block;width:28px;height:28px">${h}</span>`;
const KEY = `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><circle cx="20" cy="32" r="13" fill="#ffd34a" stroke="#1d0b3a" stroke-width="4"/><circle cx="20" cy="32" r="5" fill="#1d0b3a"/><path d="M32 29h26v7h-5v7h-6v-7h-4v5h-6v-5h-5z" fill="#ffd34a" stroke="#1d0b3a" stroke-width="3" stroke-linejoin="round"/></svg>`;
const SUBS = [
  { t: 0.8, end: T_WALK + 0.6, icons: [ic(IC.moon())], text: () => t('ano.i.s1', 'Noite de chuva. É o seu primeiro turno da noite!') },
  { t: T_WALK + 0.8, end: T_LOBBY - 0.2, icons: [ic(IC.eye())], text: () => t('ano.i.s2', 'Você chega com a lanterna e o crachá novinho.') },
  { t: T_LOBBY + 0.6, end: T_BYE + 0.2, icons: [ic(KEY), ic(IC.camera())], text: () => t('ano.i.s3', 'Chefe: "Aqui estão as chaves e a câmera. Fotografe tudo o que estiver ESTRANHO!"') },
  { t: T_BYE + 0.3, end: T_HALL - 0.1, icons: [ic(IC.hand())], text: () => t('ano.i.s4', '"Boa noite e bom trabalho!"') },
  { t: T_HALL + 0.6, end: T_SHADOW - 0.2, icons: [ic(IC.eye()), ic(IC.camera())], text: () => t('ano.i.s5', 'As luzes piscam... algo mudou de lugar? Tire uma foto!') },
  { t: T_SHADOW + 0.4, end: T_OUT - 0.1, icons: [ic(IC.bocudo())], text: () => t('ano.i.s6', 'Ei... que sombra foi essa?! O Bocudo anda por aí!') },
  { t: T_OUT + 0.4, end: T_TITLE + 1.6, icons: [ic(IC.camera()), ic(IC.sun())], text: () => t('ano.i.s7', 'Ache as anomalias e aguente firme até o sol nascer!') },
];

/* ------------------------------ texturas ------------------------------ */
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
function neonTex(): THREE.CanvasTexture {
  return canvasTex(512, 128, (x) => {
    x.fillStyle = '#1a0a2a';
    x.fillRect(0, 0, 512, 128);
    x.font = `800 58px Fredoka, 'Arial Rounded MT Bold', sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = '#ff4fd8';
    x.shadowBlur = 18;
    x.strokeStyle = '#ff7ae0';
    x.lineWidth = 5;
    const s = t('ano.name', 'Anomalias & Cia').toUpperCase();
    x.strokeText(s, 256, 66, 480);
    x.fillStyle = '#ffe6fa';
    x.fillText(s, 256, 66, 480);
  });
}
/** silhueta do Bocudo (para a sombra na parede) */
function bocudoShadowTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = 'rgba(10,0,25,1)';
    x.beginPath();
    x.ellipse(128, 150, 82, 88, 0, 0, TAU);
    x.fill();
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(128 + s * 40, 80);
      x.lineTo(128 + s * 66, 22);
      x.lineTo(128 + s * 84, 96);
      x.fill();
      x.beginPath();
      x.ellipse(128 + s * 92, 160, 34, 14, s * 0.9, 0, TAU);
      x.fill();
    }
    // boca aberta com dentinhos (recorte claro)
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.ellipse(128, 172, 44, 26, 0, 0, Math.PI);
    x.fill();
    x.globalCompositeOperation = 'source-over';
    x.beginPath();
    x.moveTo(104, 172);
    x.lineTo(112, 192);
    x.lineTo(120, 172);
    x.moveTo(136, 172);
    x.lineTo(144, 192);
    x.lineTo(152, 172);
    x.fill();
  });
}
function paintingTex(): THREE.CanvasTexture {
  return canvasTex(128, 160, (x) => {
    x.fillStyle = '#c89a4a';
    x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#7ac0ff';
    x.fillRect(10, 10, 108, 140);
    x.fillStyle = '#5ab85a';
    x.fillRect(10, 105, 108, 45);
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.arc(88, 40, 14, 0, TAU);
    x.fill();
    x.fillStyle = '#ff7ac8';
    x.beginPath();
    x.ellipse(50, 100, 22, 20, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(43, 96, 5, 0, TAU);
    x.arc(57, 96, 5, 0, TAU);
    x.fill();
    x.fillStyle = '#222';
    x.beginPath();
    x.arc(44, 97, 2.4, 0, TAU);
    x.arc(58, 97, 2.4, 0, TAU);
    x.fill();
  });
}
function windowsTex(): THREE.CanvasTexture {
  const tx = canvasTex(256, 256, (x) => {
    x.fillStyle = '#4a3a6e';
    x.fillRect(0, 0, 256, 256);
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const lit = r() < 0.45;
        x.fillStyle = '#2a2040';
        x.fillRect(i * 64 + 12, j * 64 + 10, 40, 44);
        x.fillStyle = lit ? (r() < 0.5 ? '#ffd890' : '#ffe8b8') : '#1a2240';
        x.fillRect(i * 64 + 15, j * 64 + 13, 34, 38);
        x.fillStyle = '#2a2040';
        x.fillRect(i * 64 + 31, j * 64 + 13, 2, 38);
      }
  });
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};

class AnomaliasIntro {
  private c: Cine;
  private tier: number;
  private st: Stage3D;
  private au = new AnoAudio();
  private hemi = new THREE.HemisphereLight('#7a88d0', '#1a1430', 0.55);
  private lampL = new THREE.PointLight('#ffd890', 18, 18, 1.6);
  private lobbyL = new THREE.PointLight('#ffd8a0', 16, 16, 1.5);
  private hallL: THREE.PointLight[] = [];
  private hallPanels: THREE.Mesh[] = [];
  private torch = new THREE.SpotLight('#fff2c0', 0, 16, 0.45, 0.6, 1.4);
  private hero: PaperChar;
  private boss: PaperChar;
  private bocudo = new Bocudo();
  private neon: THREE.Mesh;
  private rain: THREE.LineSegments | null = null;
  private shadowP: THREE.Mesh;
  private painting: THREE.Group;
  private keysM: THREE.Group;
  private glowT: THREE.CanvasTexture;
  private halo: THREE.Sprite;
  private texs: THREE.Texture[] = [];
  private cues = new Set<string>();
  private card: HTMLDivElement;
  private polaroid: HTMLDivElement;
  private snapCv: HTMLCanvasElement;
  private items: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.tier = detectInitialTier();
    this.c = new Cine({
      id: 'anomalias',
      root,
      duration: T_END,
      music: 'anomaliasIntro',
      subs: SUBS,
      vignette: 'rgba(10,0,30,.6)',
      grade: 'saturate(1.1) contrast(1.06)',
      iconBg: '#f2e8ff',
      title: {
        at: T_TITLE,
        text: () => t('ano.name', 'Anomalias & Cia').toUpperCase(),
        tagline: () => t('ano.i.tag', 'Olhe bem, fotografe o estranho, sobreviva à noite!'),
        colors: ['#ffffff', '#ff9ae8', '#a84aff', '#2a0b5c'],
        top: '13%',
      },
    });
    const st = this.c.stage3d(this.tier, { fov: 52, far: 260 });
    this.st = st;
    const S = st.scene;
    S.fog = new THREE.FogExp2('#141032', 0.035);
    S.add(this.hemi, this.lampL, this.lobbyL, this.torch, this.torch.target);
    this.glowT = glowTex();
    /* ---------------- exterior ---------------- */
    const wetM = new THREE.MeshStandardMaterial({ color: '#1e1a30', roughness: 0.25, metalness: 0.35 });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(120, 60).rotateX(-Math.PI / 2), wetM);
    street.position.set(0, 0, 18);
    S.add(street);
    const walkM = new THREE.MeshStandardMaterial({ color: '#4a4466', roughness: 0.5, metalness: 0.15 });
    S.add(box(60, 0.15, 3.2, walkM, 0, 0.07, 1.6));
    const wt = windowsTex();
    this.texs.push(wt);
    wt.repeat.set(3.5, 2.2);
    const facade = new THREE.MeshLambertMaterial({ map: wt, emissive: new THREE.Color('#ffffff'), emissiveMap: wt, emissiveIntensity: 0.55 });
    const plain = new THREE.MeshLambertMaterial({ color: '#4a3a6e' });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 8), [plain, plain, plain, plain, facade, plain]);
    bld.position.set(0, 4.5, -4);
    S.add(bld);
    S.add(box(14.6, 0.5, 8.6, new THREE.MeshLambertMaterial({ color: '#2a2044' }), 0, 9.2, -4));
    // vizinhos (silhuetas)
    const nb = new THREE.MeshLambertMaterial({ color: '#2a2448' });
    for (const [x, w, h] of [
      [-13, 10, 6],
      [13.5, 11, 12],
      [-24, 10, 14],
      [25, 10, 8],
    ])
      S.add(box(w, h, 9, nb, x, h / 2, -5));
    // porta iluminada + toldo
    S.add(box(2.4, 2.8, 0.1, new THREE.MeshBasicMaterial({ color: '#ffe0a0' }), 0, 1.4, 0.02));
    S.add(box(3.4, 0.16, 1.4, new THREE.MeshLambertMaterial({ color: '#ff5aa8' }), 0, 3.05, 0.65));
    // letreiro de neon
    const nt = neonTex();
    this.texs.push(nt);
    this.neon = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: nt, transparent: true, fog: false }));
    this.neon.position.set(0, 7.9, 0.12);
    S.add(this.neon);
    // poste
    const pole = new THREE.MeshLambertMaterial({ color: '#2a2a3a' });
    S.add(box(0.16, 4.6, 0.16, pole, 4.6, 2.3, 2.7));
    S.add(box(1.0, 0.12, 0.16, pole, 4.2, 4.6, 2.7));
    S.add(box(0.5, 0.18, 0.3, new THREE.MeshBasicMaterial({ color: '#fff2c0' }), 3.75, 4.5, 2.7));
    this.lampL.position.set(3.75, 4.2, 2.7);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowT, color: '#ffd890', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.position.set(3.75, 4.4, 2.7);
    this.halo.scale.setScalar(3.6);
    S.add(this.halo);
    // arbustos
    const bush = new THREE.MeshLambertMaterial({ color: '#2a5a4a' });
    for (const x of [-4.5, -2.6, 2.6, 6.2]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), bush);
      b.position.set(x, 0.45, 0.5);
      b.scale.set(1, 0.8, 0.7);
      S.add(b);
    }
    // o Bocudo que espia da esquina no final
    this.bocudo.root.scale.setScalar(0.9);
    this.bocudo.root.visible = false;
    S.add(this.bocudo.root);
    /* ---------------- interior: saguão + corredor ---------------- */
    const floorT = canvasTex(128, 128, (x) => {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        x.fillStyle = (i + j) % 2 ? '#e8dcc8' : '#5a4a7a';
        x.fillRect(i * 32, j * 32, 32, 32);
      }
    });
    floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping;
    floorT.repeat.set(6, 18);
    this.texs.push(floorT);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorT }));
    floor.position.set(IX, 0, -10);
    S.add(floor);
    const wallM = new THREE.MeshLambertMaterial({ color: '#c8b8e8' });
    const wallD = new THREE.MeshLambertMaterial({ color: '#8a6aa8' });
    // saguão (10 × 10) e corredor (3,4 de largura) para o fundo
    S.add(box(10, 4, 0.2, wallM, IX, 2, 5));
    S.add(box(0.2, 4, 10, wallM, IX - 5, 2, 0));
    S.add(box(0.2, 4, 10, wallM, IX + 5, 2, 0));
    S.add(box(3.3, 4, 0.2, wallM, IX - 3.35, 2, -5));
    S.add(box(3.3, 4, 0.2, wallM, IX + 3.35, 2, -5));
    S.add(box(0.2, 3.4, 22, wallM, IX - 1.7, 1.7, -16));
    S.add(box(0.2, 3.4, 22, wallM, IX + 1.7, 1.7, -16));
    S.add(box(3.4, 3.4, 0.2, wallD, IX, 1.7, -26.5));
    S.add(box(10, 0.2, 10, new THREE.MeshLambertMaterial({ color: '#3a2e52' }), IX, 4, 0));
    S.add(box(3.4, 0.2, 22, new THREE.MeshLambertMaterial({ color: '#3a2e52' }), IX, 3.4, -16));
    // rodapé roxo
    S.add(box(0.22, 0.6, 22, wallD, IX - 1.68, 0.3, -16));
    S.add(box(0.22, 0.6, 22, wallD, IX + 1.68, 0.3, -16));
    // portas do corredor
    const doorM = new THREE.MeshLambertMaterial({ color: '#6a4a8a' });
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        S.add(box(0.08, 2.2, 1.1, doorM, IX + s * 1.6, 1.1, -8.5 - i * 4.6 - (s > 0 ? 2 : 0)));
        S.add(box(0.06, 0.12, 0.5, new THREE.MeshBasicMaterial({ color: i === 2 && s > 0 ? '#ff5a7a' : '#7dffb0' }), IX + s * 1.56, 2.5, -8.5 - i * 4.6 - (s > 0 ? 2 : 0)));
      }
    }
    // balcão da recepção + abajur + planta
    S.add(box(3.6, 1.1, 1.0, new THREE.MeshLambertMaterial({ color: '#ff8ab8' }), IX, 0.55, -2.4));
    S.add(box(3.8, 0.1, 1.15, new THREE.MeshLambertMaterial({ color: '#fff0f6' }), IX, 1.14, -2.4));
    S.add(box(0.1, 0.5, 0.1, pole, IX + 1.3, 1.45, -2.5));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe8a0', side: THREE.DoubleSide }));
    shade.position.set(IX + 1.3, 1.75, -2.5);
    S.add(shade);
    this.lobbyL.position.set(IX + 0.6, 2.6, -0.6);
    const pot = box(0.5, 0.5, 0.5, new THREE.MeshLambertMaterial({ color: '#c8643a' }), IX - 4, 0.25, -4);
    S.add(pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshLambertMaterial({ color: '#3a9a5a' }));
    leaf.position.set(IX - 4, 1.0, -4);
    S.add(leaf);
    // quadro que entorta (anomalia!)
    const pt = paintingTex();
    this.texs.push(pt);
    this.painting = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshLambertMaterial({ map: pt }));
    pm.position.y = -0.5;
    this.painting.add(pm);
    this.painting.position.set(IX - 1.58, 2.35, -11.2);
    this.painting.rotation.y = Math.PI / 2;
    S.add(this.painting);
    // luzes do teto do corredor (piscam)
    const panelM = new THREE.MeshBasicMaterial({ color: '#fff4d0' });
    for (let i = 0; i < 4; i++) {
      const z = -7.5 - i * 5;
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.6), panelM.clone());
      p.position.set(IX, 3.27, z);
      S.add(p);
      this.hallPanels.push(p);
      if (i < [1, 2, 3, 3][this.tier]) {
        const l = new THREE.PointLight('#fff0d0', 6, 9, 1.6);
        l.position.set(IX, 3.0, z);
        S.add(l);
        this.hallL.push(l);
      }
    }
    // sombra na parede direita do corredor
    const sht = bocudoShadowTex();
    this.texs.push(sht);
    this.shadowP = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: sht, transparent: true, opacity: 0, depthWrite: false }));
    this.shadowP.rotation.y = -Math.PI / 2;
    this.shadowP.position.set(IX + 1.58, 1.5, -18);
    S.add(this.shadowP);
    // chaves (penduradas na mão do chefe → voam para o Bloop)
    this.keysM = new THREE.Group();
    const km = new THREE.MeshLambertMaterial({ color: '#ffd34a', emissive: new THREE.Color('#5a4000') });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 16), km);
    this.keysM.add(ring);
    for (const s of [-1, 1]) {
      const k = box(0.04, 0.18, 0.02, km, s * 0.05, -0.14, 0);
      k.rotation.z = s * 0.3;
      this.keysM.add(k);
    }
    this.keysM.visible = false;
    S.add(this.keysM);
    /* ---------------- personagens ---------------- */
    this.hero = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    S.add(this.hero.root);
    this.boss = new PaperChar(npcSpec('#8a9ac8', '#4a5a8a', { mouth: 'mo_mustache', face: 'f_glasses', head: 'h_tophat', eyes: 'e_dots' }), { radius: 0.55, cell: 128, shadow: true });
    S.add(this.boss.root);
    /* ---------------- telas 2D: crachá, itens, polaroide ---------------- */
    const L = this.c.layer;
    this.card = document.createElement('div');
    this.card.style.cssText = 'position:absolute;left:7%;top:20%;width:min(30vw,190px);aspect-ratio:3/4;border-radius:14px;background:linear-gradient(180deg,#ff7ae0 0 22%,#fff 22%);box-shadow:0 10px 26px rgba(0,0,0,.55);transform:translateY(40px) rotate(-14deg) scale(.5);opacity:0;transition:transform .7s cubic-bezier(.2,1.5,.4,1),opacity .4s;display:flex;flex-direction:column;align-items:center;padding:8px;box-sizing:border-box;font-weight:800;color:#2a0b5c;text-align:center;overflow:hidden';
    const nm = (displayName() || 'Bloop').slice(0, 14);
    this.card.innerHTML = `<div style="font-size:clamp(10px,1.6vw,14px);color:#fff;letter-spacing:.08em">${t('ano.i.badge', 'CRACHÁ')}</div><div style="width:58%;aspect-ratio:1;margin:10% 0 6%;border-radius:12px;background:#e8e0ff;display:grid;place-items:center;padding:6%">${IC.bocudo()}</div><div style="font-size:clamp(11px,1.8vw,16px)"></div><div style="font-size:clamp(9px,1.3vw,12px);color:#8a5ab8">${t('ano.i.role', 'Turno da noite')}</div>`;
    (this.card.children[2] as HTMLElement).textContent = nm;
    L.appendChild(this.card);
    this.items = document.createElement('div');
    this.items.style.cssText = 'position:absolute;right:9%;top:22%;display:flex;gap:14px';
    this.items.innerHTML = [KEY, IC.camera()]
      .map((h, i) => `<div data-i="${i}" style="width:min(13vw,80px);aspect-ratio:1;border-radius:50%;background:#fff6dc;box-shadow:0 8px 20px rgba(0,0,0,.5);padding:12px;box-sizing:border-box;transform:scale(0);transition:transform .6s cubic-bezier(.2,1.6,.4,1) ${i * 0.35}s">${h}</div>`)
      .join('');
    L.appendChild(this.items);
    this.polaroid = document.createElement('div');
    this.polaroid.style.cssText = 'position:absolute;right:8%;top:14%;width:min(30vw,220px);padding:8px 8px 30px;background:#fbfbf6;box-shadow:0 12px 30px rgba(0,0,0,.6);transform:translate(120%,-30%) rotate(18deg);opacity:0;transition:transform .9s cubic-bezier(.2,1.2,.4,1),opacity .3s';
    this.snapCv = document.createElement('canvas');
    this.snapCv.width = 320;
    this.snapCv.height = 240;
    this.snapCv.style.cssText = 'width:100%;display:block;background:#000;filter:sepia(.25) saturate(1.2) contrast(1.05)';
    this.polaroid.appendChild(this.snapCv);
    L.appendChild(this.polaroid);
    this.c.onFrame = (tt, dt) => this.frame(tt, dt);
    this.c.onDispose = () => this.dispose();
    if (location.search.includes('debug')) (window as unknown as { __intro: unknown }).__intro = this;
  }

  play(): Promise<void> {
    return this.c.play();
  }
  private cue(id: string, fn: () => void): void {
    if (this.cues.has(id)) return;
    this.cues.add(id);
    fn();
  }

  private frame(tt: number, dt: number): void {
    const st = this.st;
    const cam = st.cam;
    const inside = tt >= T_LOBBY && tt < T_OUT;
    const fog = st.scene.fog as THREE.FogExp2;
    fog.color.set(inside ? '#1a1430' : '#141032');
    fog.density = inside ? 0.03 : 0.028;
    st.r.setClearColor(fog.color);
    this.hemi.intensity = inside ? 0.7 : 0.5;
    // relâmpagos lá fora
    let bolt = 0;
    for (const b of [2.2, 9.6, 33.4]) {
      const k = tt - b;
      if (k >= 0 && k < 0.5) bolt = Math.max(bolt, k < 0.07 ? 1 : k < 0.12 ? 0.2 : k < 0.2 ? 0.7 : Math.max(0, 1 - (k - 0.2) * 3.3));
      if (k >= 0) this.cue('b' + b, () => !inside && (this.c.flash(0.35, '#d8e0ff'), this.au.burst(2.4, 0.35, 140, { slide: 0.5, rev: 0.6, delay: 0.25 })));
    }
    if (!inside) this.hemi.intensity += bolt * 2.5;
    // letreiro: pisca (falha) até o fim, quando acende de vez
    const neonOn = tt >= T_TITLE - 0.6 ? 1 : flicker(tt, 3.2, 2) * 0.85 + 0.15;
    const nm = this.neon.material as THREE.MeshBasicMaterial;
    nm.color.setScalar(0.35 + neonOn * 0.65);
    if (tt >= T_TITLE - 0.6) this.cue('neon', () => this.au.powerUp());
    // ---------------- herói ----------------
    const hero = this.hero;
    const hp = new THREE.Vector3();
    let yaw = 0;
    let speed = 0;
    let happy = false;
    let hurt = false;
    let act = -1;
    let tool: 'lamp' | null = 'lamp';
    if (tt < T_LOBBY) {
      const k = seg(tt, T_WALK - 2.5, T_LOBBY - 0.8);
      hp.set(lerp(-9, 0, ease(k)), 0.15, lerp(2.1, 0.9, ease(seg(k, 0.7, 1))));
      speed = k > 0 && k < 1 ? 2.2 : 0;
      yaw = k < 0.85 ? Math.PI / 2 : Math.PI;
      if (tt >= T_BADGE && tt < T_BADGE + 2.5) {
        yaw = 0.25;
        happy = true;
        speed = 0;
      }
    } else if (tt < T_HALL) {
      hp.set(IX - 0.3, 0, 0.6);
      yaw = Math.PI;
      happy = tt > T_GIVE + 0.6 && tt < T_BYE + 1;
      tool = tt > T_GIVE + 0.9 ? 'lamp' : null;
      if (tt > T_BYE) yaw = Math.atan2(this.boss.root.position.x - hp.x, this.boss.root.position.z - hp.z);
    } else if (tt < T_OUT) {
      const k = seg(tt, T_HALL, T_TILT + 1.2);
      hp.set(IX, 0, lerp(-6, -13, ease(k)));
      speed = k > 0 && k < 1 ? 1.6 : 0;
      yaw = Math.PI;
      if (tt >= T_SNAP - 0.5 && tt < T_SNAP + 0.5) act = seg(tt, T_SNAP - 0.5, T_SNAP);
      if (tt >= T_TURN) yaw = lerp(Math.PI, 0.05, ease(seg(tt, T_TURN, T_TURN + 0.5)) - ease(seg(tt, T_TURN + 1.3, T_TURN + 1.8)));
      hurt = tt >= T_SHADOW + 1 && tt < T_TURN + 0.4;
      happy = tt >= T_TURN + 1.6;
    } else {
      hp.set(-3.2, 0.15, 2.4);
      yaw = 0.4;
      happy = true;
    }
    hero.root.position.copy(hp);
    hero.setTool(tool, '#ffe680');
    // lanterna: luz que sai da mão para frente
    this.torch.intensity = tool && (tt < T_LOBBY || (tt >= T_HALL && tt < T_OUT)) ? 22 : 0;
    this.torch.position.copy(hp).add(new THREE.Vector3(0, 0.8, 0));
    this.torch.target.position.copy(hp).add(new THREE.Vector3(Math.sin(yaw) * 5, 0.2, Math.cos(yaw) * 5));
    // ---------------- chefe ----------------
    const bp = new THREE.Vector3(IX + 0.2, 0.45, -3.3);
    let byaw = 0;
    let bspeed = 0;
    let bAct = -1;
    if (tt >= T_BYE) {
      const k = seg(tt, T_BYE + 0.3, T_HALL);
      bp.set(lerp(IX + 2.2, IX + 2.6, k), 0, lerp(-2.0, 4.6, ease(k)));
      byaw = k > 0 ? 0 : Math.PI;
      bspeed = k > 0 && k < 1 ? 1.8 : 0;
      if (tt < T_BYE + 0.6) bAct = 0.5;
    }
    if (tt >= T_GIVE - 0.2 && tt < T_GIVE + 0.5) bAct = seg(tt, T_GIVE - 0.2, T_GIVE + 0.3);
    this.boss.root.position.copy(bp);
    this.boss.root.visible = inside;
    this.boss.update(dt, cam, { yaw: byaw, speed: bspeed, act: bAct, happy: tt > T_LOBBY + 0.5 && tt < T_BYE + 2 });
    // chaves voando do chefe para o Bloop
    const kk = seg(tt, T_GIVE, T_GIVE + 0.9);
    this.keysM.visible = inside && tt >= T_LOBBY && kk < 1;
    this.keysM.position.copy(bp).add(new THREE.Vector3(0.3, 1.3, 0.4)).lerp(hp.clone().add(new THREE.Vector3(0.2, 0.75, 0)), easeOut(kk));
    this.keysM.position.y += bump(kk) * 0.6;
    this.keysM.rotation.set(0, tt * 3, Math.sin(tt * 8) * 0.4);
    // ---------------- corredor: luzes, quadro, sombra ----------------
    const hallOn = tt >= T_HALL - 0.5 && tt < T_OUT;
    const fl = tt > T_HALL + 1 && tt < T_SNAP ? flicker(tt, 6.5, 3) : tt >= T_SHADOW && tt < T_TURN + 0.3 ? flicker(tt, 9, 5) * 0.7 + 0.1 : 1;
    if (fl < 0.5 && hallOn) this.cue('fl' + Math.floor(tt * 3), () => this.au.flicker());
    this.hallPanels.forEach((p, i) => (p.material as THREE.MeshBasicMaterial).color.setScalar(i === 1 ? 0.25 + fl * 0.75 : 0.35 + 0.65 * (i === 2 ? fl : 1)));
    this.hallL.forEach((l, i) => (l.intensity = (hallOn ? 6 : 0) * (i === 1 ? 0.2 + fl * 0.8 : i === 2 ? fl : 1)));
    this.lobbyL.intensity = inside ? 16 : 0;
    this.lampL.intensity = inside ? 0 : 18 * (0.92 + Math.sin(tt * 17) * 0.04);
    const tilt = easeBack(seg(tt, T_TILT, T_TILT + 0.8), 3) * 0.32;
    this.painting.rotation.z = tilt;
    if (tt >= T_TILT) this.cue('creak', () => this.au.whisper(-0.4));
    // sombra do Bocudo passando na parede atrás do Bloop
    const sk = seg(tt, T_SHADOW, T_TURN - 0.3);
    const sm = this.shadowP.material as THREE.MeshBasicMaterial;
    sm.opacity = hallOn ? bump(sk) * 0.72 : 0;
    this.shadowP.position.set(IX + 1.58, 1.45 + Math.abs(Math.sin(sk * 12)) * 0.12, lerp(-20, -9.5, sk));
    this.shadowP.scale.setScalar(lerp(1.5, 1.05, sk));
    if (tt >= T_SHADOW) this.cue('growl', () => this.au.growl(0.6));
    if (tt >= T_SHADOW + 0.4) this.cue('tension', () => music.setState('tension'));
    if (tt >= T_TURN) this.cue('turn', () => this.au.bad());
    if (tt >= T_TURN + 1.4) this.cue('calm', () => music.setState('calm'));
    // flash + polaroide (copia a imagem do quadro logo depois de desenhar)
    let snapNow = false;
    if (tt >= T_SNAP) this.cue('snap', () => {
      this.au.shutter();
      this.c.flash(0.95);
      snapNow = true;
    });
    // ---------------- Bocudo espiando lá fora ----------------
    const pk = ease(seg(tt, T_TITLE - 1.2, T_TITLE)) * (1 - ease(seg(tt, T_END - 2.2, T_END - 1.4)));
    this.bocudo.root.visible = tt >= T_OUT && pk > 0.01;
    this.bocudo.root.position.set(7.9 - pk * 1.2, 9.35, -0.4);
    this.bocudo.root.rotation.y = Math.PI - 0.5;
    this.bocudo.open = 0.3 + Math.max(0, Math.sin(tt * 2)) * 0.4;
    this.bocudo.update(dt);
    if (tt >= T_TITLE) this.cue('vic', () => {
      music.setState('victory');
      this.au.squeal();
    });
    // ---------------- câmera (planos) ----------------
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (tt < T_WALK) {
      // 1. grua descendo do letreiro até a rua molhada
      const k = ease5(seg(tt, 0, T_WALK));
      pos.set(lerp(2, -1.5, k), lerp(9.5, 2.2, k), lerp(9, 11, k));
      look.set(lerp(0, -1, k), lerp(8, 2.2, k), 0);
    } else if (tt < T_LOBBY) {
      // 2. o Bloop chegando pela calçada (travelling de lado, baixo)
      const k = ease(seg(tt, T_WALK, T_LOBBY));
      pos.set(hp.x + lerp(1.8, 1.2, k), lerp(1.0, 1.25, k), hp.z + lerp(4.2, 3.6, k));
      look.set(hp.x + lerp(-0.6, 0.6, k), 0.85, hp.z - 0.5);
    } else if (tt < T_HALL) {
      // 3. saguão: por cima do ombro do Bloop até o chefe
      const k = ease(seg(tt, T_LOBBY, T_HALL));
      pos.set(IX + lerp(-2.3, -1.8, k), lerp(1.7, 1.6, k), lerp(4.6, 4.0, k));
      look.set(IX + lerp(0.1, 0.4, k), lerp(0.95, 1.0, k), lerp(-1.2, -0.6, k));
    } else if (tt < T_SHADOW) {
      // 4. corredor: atrás do Bloop, seguindo
      pos.set(hp.x + 0.7, 1.3, hp.z + 3.0);
      look.set(hp.x - 0.05, 0.75, hp.z - 1.0);
    } else if (tt < T_OUT) {
      // 5. de frente para o Bloop; a sombra passa na parede atrás dele
      const k = ease(seg(tt, T_SHADOW, T_OUT));
      pos.set(IX - 0.9, lerp(1.2, 1.1, k), hp.z - lerp(3.4, 2.7, k));
      look.set(IX + 0.3, 0.85, hp.z + 0.8);
    } else {
      // 6. lá fora: grua subindo até o letreiro, o Bocudo na esquina
      const k = ease5(seg(tt, T_OUT, T_END - 0.5));
      pos.set(lerp(-6, 0.6, k), lerp(1.4, 4.4, k), lerp(7.5, 15, k));
      look.set(lerp(-2.4, 1.2, k), lerp(1.2, 8.7, k), 0);
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.rotation.z += Math.sin(tt * 0.7) * 0.004;
    hero.update(dt, cam, { yaw, speed, act, happy, hurt });
    this.updateRain(dt, !inside);
    st.render();
    if (snapNow) this.snapshot();
    // ---------------- telas 2D ----------------
    const cardOn = tt >= T_BADGE && tt < T_BADGE + 3.2;
    this.card.style.opacity = cardOn ? '1' : '0';
    this.card.style.transform = cardOn ? 'translateY(0) rotate(-6deg) scale(1)' : 'translateY(40px) rotate(-14deg) scale(.5)';
    if (cardOn) this.cue('card', () => this.au.pick());
    const itOn = tt >= T_GIVE && tt < T_BYE + 0.8;
    this.items.querySelectorAll<HTMLElement>('[data-i]').forEach((d) => (d.style.transform = itOn ? 'scale(1)' : 'scale(0)'));
    if (itOn) this.cue('items', () => this.au.taskDone());
    const polOn = tt >= T_SNAP + 0.25 && tt < T_SHADOW - 0.1;
    this.polaroid.style.opacity = polOn ? '1' : '0';
    this.polaroid.style.transform = polOn ? 'translate(0,0) rotate(-5deg)' : 'translate(120%,-30%) rotate(18deg)';
  }

  /** a foto: copia o quadro desenhado para o "papel" da polaroide */
  private snapshot(): void {
    const src = this.st.r.domElement;
    const x = this.snapCv.getContext('2d')!;
    const sw = src.width;
    const sh = src.height;
    const ar = 4 / 3;
    const w = Math.min(sw, sh * ar);
    const h = w / ar;
    try {
      x.drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, 320, 240);
    } catch {
      x.fillStyle = '#222';
      x.fillRect(0, 0, 320, 240);
    }
  }

  private updateRain(dt: number, on: boolean): void {
    if (!on || this.tier < 1) {
      if (this.rain) this.rain.visible = false;
      return;
    }
    if (!this.rain) {
      const n = this.tier >= 2 ? 600 : 300;
      const g = new THREE.BufferGeometry();
      const a = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 26;
        const y = Math.random() * 14;
        const z = (Math.random() - 0.5) * 26;
        a.set([x, y, z, x + 0.05, y - 0.55, z], i * 6);
      }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a8b8ff', transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.st.scene.add(this.rain);
    }
    this.rain.visible = true;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const fall = dt * 17;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= fall;
      arr[i + 4] -= fall;
      if (arr[i + 1] < 0) {
        arr[i + 1] += 14;
        arr[i + 4] += 14;
      }
    }
    pos.needsUpdate = true;
    const cp = this.st.cam.position;
    this.rain.position.set(cp.x, 0, cp.z - 6);
  }

  private dispose(): void {
    this.hero.dispose();
    this.boss.dispose();
    // o Bocudo usa materiais/geometrias em cache do jogo: não liberar aqui
    this.bocudo.root.removeFromParent();
    for (const tx of this.texs) tx.dispose();
    this.glowT.dispose();
    this.au.dispose();
  }
}

/** toca a abertura por cima de `root` (resolve no fim, ao Pular ou no voltar) */
export function playIntro(root: HTMLElement): Promise<void> {
  return new AnomaliasIntro(root).play();
}
