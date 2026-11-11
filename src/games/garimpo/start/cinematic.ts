/* ============================================================
 *  GARIMPO — ABERTURA (≈40 s, "Pular" sempre visível). Toca no jogo novo e dá para rever no menu.
 *  Usa o próprio mundo do save (vale, lago, montanha) — tudo procedural, nada pesado:
 *   1. Amanhecer no vale de terra vermelha: grua alta sobre o rio, pássaros, brilhos na água.
 *   2. O mapa/carta do vovô garimpeiro ("tem ouro na montanha!") desenhado em canvas.
 *   3. O SEU Bloop (papel) chega de canoa só com mochila, bateia e pá (travelling baixo).
 *   4. Desce na margem e olha a clareira vazia (por cima do ombro, aproximando).
 *   5. SONHO: noite, o acampamento cheio — lavadora, garagem, galpão, casas, máquinas, luzes e
 *      barras de ouro — grua passando por cima; volta num clarão para a terra vazia.
 *   6. Close no Bloop feliz junto da fogueira → grua sobe por trás revelando o vale + título
 *      "GARIMPO BRUTO" com brilho.
 *  Gradação quente (CSS), barras de cinema, legendas com ícones, narração (só se ligada),
 *  tema próprio 'garimpoIntro' com vinheta 'title'. Qualidade: menos pássaros/brilhos/luzes
 *  nos níveis baixos.
 * ============================================================ */
import './cinematic.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { music } from '../../../audio';
import { sfx } from '../../../3d/common/sfx';
import { mySpec, PaperChar } from '../../../3d/paper';
import { hush, speak } from '../../voo/voice';
import { makeMachine, type Machine } from '../machines';
import { setLod } from '../kit';
import { World } from '../world';
import { SI, type SIcon } from './icons';
import { buildCanoe, buildPaddle, glowTexture } from './models';
import { Site } from './site';

const TAU = Math.PI * 2;
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const ease2 = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const C = (h: number) => new THREE.Color(h);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** paletas (gradação de cor do céu e da luz) */
const LOOKS = {
  dawn: { top: C(0x3d5f9e), bot: C(0xf4a37a), sun: C(0xffb27a), sunI: 1.7, hemiI: 1.25, hemiSky: C(0xffd2b0) },
  morning: { top: C(0x4f9be0), bot: C(0xf6d6a2), sun: C(0xffe2b0), sunI: 2.5, hemiI: 1.8, hemiSky: C(0xdfefff) },
  night: { top: C(0x0b1236), bot: C(0x2a2f5e), sun: C(0x8fa6ff), sunI: 0.35, hemiI: 0.55, hemiSky: C(0x6a7ad0) },
  golden: { top: C(0x5a86c8), bot: C(0xffc88a), sun: C(0xffc070), sunI: 2.2, hemiI: 1.5, hemiSky: C(0xffe0c0) },
};
type Look = (typeof LOOKS)['dawn'];
const _lk: Look = { top: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), sunI: 0, hemiI: 0, hemiSky: new THREE.Color() };
function mix(a: Look, b: Look, k: number): Look {
  _lk.top.copy(a.top).lerp(b.top, k);
  _lk.bot.copy(a.bot).lerp(b.bot, k);
  _lk.sun.copy(a.sun).lerp(b.sun, k);
  _lk.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, k);
  _lk.sunI = lerp(a.sunI, b.sunI, k);
  _lk.hemiI = lerp(a.hemiI, b.hemiI, k);
  return _lk;
}

interface Sub {
  t: number;
  icons: SIcon[];
  text: () => string;
}
/** roteiro (s) */
const T_LETTER = 6.5;
const T_CANOE = 12.5;
const T_LAND = 20.5;
const T_DREAM = 26;
const T_BACK = 33.5;
const T_TITLE = 35.8;
const T_END = 42;
const SUBS: Sub[] = [
  { t: 0.8, icons: ['sun', 'mountain'], text: () => t('gb.i.s1', 'Amanhece no vale de terra vermelha...') },
  { t: T_LETTER + 0.6, icons: ['grandpa', 'map', 'gold'], text: () => t('gb.i.s2', 'O vovô garimpeiro deixou um mapa: tem ouro na montanha!') },
  { t: T_CANOE + 0.8, icons: ['canoe', 'bag', 'pan', 'shovel'], text: () => t('gb.i.s3', 'Você chega de canoa, só com uma mochila, uma bateia e uma pá.') },
  { t: T_LAND + 0.8, icons: ['tent'], text: () => t('gb.i.s4', 'Aqui ainda não tem nada... só o rio e uma calha velha.') },
  { t: T_DREAM + 0.6, icons: ['excavator', 'light', 'gold'], text: () => t('gb.i.s5', 'Mas um dia... máquinas grandes, luzes à noite e barras de ouro!') },
  { t: T_BACK + 0.3, icons: ['heart'], text: () => t('gb.i.s5b', 'E tudo começa agora, com você!') },
  { t: T_TITLE + 0.4, icons: ['hammer', 'heart'], text: () => t('gb.i.s6', 'Vamos construir tudo, do zero!') },
];

export interface CineOpts {
  wrap: HTMLElement;
  r: THREE.WebGLRenderer;
  w: World;
  site: Site;
  tier: number;
  /** objetos do jogo escondidos durante a abertura (o garimpeiro) */
  hide?: THREE.Object3D[];
}

class Cinematic {
  private o: CineOpts;
  private cam: THREE.PerspectiveCamera;
  private el: HTMLDivElement;
  private raf = 0;
  private last = 0;
  private time = 0;
  private done!: () => void;
  private ended = false;
  private restoreGrade: () => void;
  private hero: PaperChar;
  private canoe: THREE.Group;
  private paddle: THREE.Group;
  private group = new THREE.Group();
  private birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; ph: number; off: THREE.Vector3 }[] = [];
  private sparks: THREE.Sprite[] = [];
  private stars: THREE.Points;
  private glows: THREE.Sprite[] = [];
  private lights: THREE.PointLight[] = [];
  private machines: Machine[] = [];
  private bldWas = new Map<string, boolean>();
  private barsWas = 0;
  private subI = -1;
  private dreamOn = false;
  private stingDone = false;
  private hidden: THREE.Object3D[] = [];
  private P: {
    L: THREE.Vector3;
    shore: THREE.Vector3;
    f: THREE.Vector3;
    s: THREE.Vector3;
    camp: THREE.Vector3;
    mtn: THREE.Vector3;
    spawn: THREE.Vector3;
    level: number;
  };

  constructor(o: CineOpts) {
    this.o = o;
    const w = o.w;
    const m = w.map;
    const T = w.T;
    const lay = o.site.lay;
    const W = o.wrap.clientWidth || 1;
    const H = o.wrap.clientHeight || 1;
    this.cam = new THREE.PerspectiveCamera(W / H < 1.2 ? 66 : 50, W / H, 0.3, w.camera.far);
    const v = (x: number, z: number, dy = 0) => new THREE.Vector3(x, T.heightAt(x, z) + dy, z);
    this.P = {
      L: new THREE.Vector3(m.lake.x, m.lake.level, m.lake.z),
      shore: v(lay.shore.x, lay.shore.z),
      f: new THREE.Vector3(lay.f[0], 0, lay.f[1]),
      s: new THREE.Vector3(lay.s[0], 0, lay.s[1]),
      camp: v(m.camp.x, m.camp.z),
      mtn: v(m.mountain.x, m.mountain.z),
      spawn: v(lay.spawn.x, lay.spawn.z),
      level: m.lake.level,
    };
    this.restoreGrade = w.gradeSnap();
    // personagens e objetos
    this.hero = new PaperChar(mySpec(), { radius: 0.52, cell: 128, shadow: true });
    this.group.add(this.hero.root);
    this.canoe = buildCanoe();
    this.group.add(this.canoe);
    this.paddle = buildPaddle();
    this.canoe.add(this.paddle);
    this.paddle.position.set(0.55, 0.9, 0.25);
    // pássaros (V de duas asas)
    const nb = [4, 6, 9, 12][o.tier] ?? 8;
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.16, 0.7, 0.05, 0], 3));
    wingG.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x2a1d1a, side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < nb; i++) {
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wingG, bm);
      const wr = new THREE.Mesh(wingG, bm);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.scale.setScalar(0.9 + Math.random() * 0.4);
      const row = Math.ceil(i / 2);
      this.birds.push({ g, wl, wr, ph: Math.random() * TAU, off: new THREE.Vector3((i % 2 ? 1 : -1) * row * 1.6, Math.sin(i) * 0.6, -row * 1.8) });
      this.group.add(g);
    }
    // brilhos na água
    const tex = glowTexture();
    const ns = [16, 28, 44, 64][o.tier] ?? 30;
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * (m.lake.r - 1);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      sp.position.set(m.lake.x + Math.cos(a) * rr, m.lake.level + 0.06, m.lake.z + Math.sin(a) * rr);
      sp.userData.ph = Math.random() * TAU;
      sp.userData.sp = 1.5 + Math.random() * 2.5;
      this.sparks.push(sp);
      this.group.add(sp);
    }
    // estrelas do sonho
    const NS = [150, 220, 320, 420][o.tier] ?? 250;
    const sp = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      const a = Math.random() * TAU;
      const y = 0.15 + Math.random() * 0.85;
      const q = Math.sqrt(1 - y * y);
      sp.set([Math.cos(a) * q * 150, y * 150, Math.sin(a) * q * 150], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6d0, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    this.stars.visible = false;
    this.group.add(this.stars);
    w.scene.add(this.group);
    // tela
    const el = document.createElement('div');
    el.className = 'gbi-root';
    el.innerHTML = `<div class="gbi-grade"></div><div class="gbi-dream"></div><div class="gbi-bar t"></div><div class="gbi-bar b"></div>
      <div class="gbi-letter"><canvas></canvas></div>
      <div class="gbi-title"><b data-t="${esc(t('gb.name', 'Garimpo Bruto').toUpperCase())}">${esc(t('gb.name', 'Garimpo Bruto').toUpperCase())}</b><i></i></div>
      <div class="gbi-sub"><span class="gbi-ic"></span><span class="gbi-tx"></span></div>
      <div class="gbi-flash"></div><div class="gbi-fade on"></div>
      <button class="gbi-skip" data-touch-ignore>${esc(t('gb.i.skip', 'Pular'))}${SI.skip}</button>`;
    o.wrap.appendChild(el);
    o.wrap.classList.add('gbi-playing');
    this.el = el;
    el.querySelector('.gbi-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.click();
      this.finish();
    });
    this.drawLetter(el.querySelector('.gbi-letter canvas') as HTMLCanvasElement);
    // o garimpeiro do jogo some (o herói da abertura toma o lugar dele)
    for (const ob of o.hide ?? []) {
      if (ob.visible) this.hidden.push(ob);
      ob.visible = false;
    }
    o.site.showTags(false);
    if (location.search.includes('debug')) (window as unknown as { __gbIntro: Cinematic }).__gbIntro = this;
  }
  /** testes: pula para um instante */
  seek(t: number): void {
    this.time = t;
  }

  run(): Promise<void> {
    return new Promise((res) => {
      this.done = res;
      music.play('garimpoIntro', 1.5);
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
      window.setTimeout(() => this.el.querySelector('.gbi-fade')?.classList.remove('on'), 60);
    });
  }

  private loop = (now: number): void => {
    if (this.ended) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.frame(dt);
    if (this.time >= T_END) this.finish();
  };

  /* ============================== quadro ============================== */
  private frame(dt: number): void {
    const o = this.o;
    const w = o.w;
    const T = w.T;
    const P = this.P;
    const tt = this.time;
    const cam = this.cam;
    const W = o.wrap.clientWidth || 1;
    const H = o.wrap.clientHeight || 1;
    if (Math.abs(cam.aspect - W / H) > 1e-3) {
      cam.aspect = W / H;
      cam.fov = W / H < 1.2 ? 66 : 50;
      cam.updateProjectionMatrix();
    }
    const f = P.f;
    const s = P.s;
    const at = (base: THREE.Vector3, ff: number, ss: number, y: number) => new THREE.Vector3(base.x + f.x * ff + s.x * ss, 0, base.z + f.z * ff + s.z * ss).setY(y);
    const ground = (p: THREE.Vector3, dy: number) => p.setY(Math.max(T.heightAt(p.x, p.z), P.level) + dy);
    // ---------------- herói / canoa ----------------
    const c0 = at(P.shore, -16, 4, P.level);
    const c1 = at(P.shore, -1.4, 0.4, P.level);
    let canoeK = 0;
    if (tt < T_CANOE) canoeK = 0;
    else canoeK = ease2(Math.min(1, (tt - T_CANOE) / (T_LAND - T_CANOE - 0.6)));
    const cp = c0.clone().lerp(c1, canoeK);
    const bob = Math.sin(tt * 1.7) * 0.04;
    this.canoe.position.set(cp.x, P.level - 0.12 + bob, cp.z);
    this.canoe.rotation.set(Math.sin(tt * 1.3) * 0.03, Math.atan2(c1.x - c0.x, c1.z - c0.z), Math.sin(tt * 1.1) * 0.04);
    this.canoe.visible = tt >= T_LETTER;
    const rowing = tt >= T_CANOE && canoeK < 0.98;
    this.paddle.rotation.set(rowing ? Math.sin(tt * 3) * 0.7 : 0.4, 0, rowing ? 0.3 + Math.cos(tt * 3) * 0.25 : 0.5);
    // herói: sentado na canoa → desce e anda até a clareira → perto da fogueira
    const hp = new THREE.Vector3();
    let hyaw = Math.atan2(f.x, f.z);
    let hspeed = 0;
    let happy = false;
    let act = -1;
    const walk0 = T_LAND + 0.4;
    const walk1 = T_LAND + 3.2;
    const stand = at(P.shore, 2.2, 0.6, 0);
    if (tt < walk0) {
      this.canoe.updateMatrixWorld();
      hp.set(0, 0.18, -0.35).applyMatrix4(this.canoe.matrixWorld);
      hyaw = this.canoe.rotation.y;
      act = rowing ? (tt * 1.5) % 1 : -1;
    } else if (tt < walk1) {
      const k = ease((tt - walk0) / (walk1 - walk0));
      this.canoe.updateMatrixWorld();
      const from = new THREE.Vector3(0, 0.18, -0.35).applyMatrix4(this.canoe.matrixWorld);
      hp.copy(from).lerp(stand, k);
      hp.y = Math.max(T.heightAt(hp.x, hp.z), P.level) + (k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 0.35 : 0);
      hspeed = 2.4;
    } else {
      hp.copy(stand);
      ground(hp, 0);
    }
    if (tt >= T_BACK) {
      // perto da fogueira, de frente para a câmera e feliz
      hp.copy(at(P.shore, 3.4, 1.2, 0));
      ground(hp, 0);
      hyaw = Math.atan2(-f.x, -f.z) + 0.5;
      happy = tt < T_TITLE + 1.2;
    }
    // título: o Bloop olha o rio (vista aberta, céu e brilhos na água)
    if (tt >= T_TITLE + 1.2) hyaw = Math.atan2(-f.x, -f.z);
    this.hero.root.position.copy(hp);
    this.hero.root.visible = tt >= T_LETTER;
    // ---------------- câmera (planos) ----------------
    const look = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let grade: Look = LOOKS.dawn;
    if (tt < T_LETTER) {
      // 1. amanhecer: grua alta descendo sobre o rio, olhando o vale e a montanha
      // atrás do lago (lado oposto à montanha), olhando a água e a montanha ao fundo
      const k = ease(tt / T_LETTER);
      const dm = new THREE.Vector3(P.L.x - P.mtn.x, 0, P.L.z - P.mtn.z).normalize();
      const sd = new THREE.Vector3(dm.z, 0, -dm.x);
      pos.copy(P.L).addScaledVector(dm, 34 - k * 14).addScaledVector(sd, 8 - k * 4);
      pos.y = P.level + 38 - k * 20;
      look.copy(P.L).lerp(P.mtn, 0.05 + k * 0.4);
      look.y = P.level + k * 8;
      grade = LOOKS.dawn;
    } else if (tt < T_CANOE) {
      // 2. carta do vovô: câmera passeia devagar sobre a água (fundo da carta)
      const k = (tt - T_LETTER) / (T_CANOE - T_LETTER);
      pos.copy(at(P.L, -12, 10, P.level + 9)).lerp(at(P.L, -6, -4, P.level + 6), k);
      look.copy(P.shore).setY(P.shore.y + 1);
      grade = mix(LOOKS.dawn, LOOKS.morning, ease(k) * 0.5);
    } else if (tt < T_LAND) {
      // 3. canoa: travelling baixo do lado, acompanhando
      const k = (tt - T_CANOE) / (T_LAND - T_CANOE);
      const side = 7.5 - k * 2;
      pos.copy(this.canoe.position).addScaledVector(s, side).addScaledVector(f, 1.5 + k * 1.5);
      pos.y = P.level + 2.2 + k * 0.6;
      look.copy(this.canoe.position).addScaledVector(f, 1.2);
      look.y = P.level + 0.8;
      grade = mix(LOOKS.dawn, LOOKS.morning, 0.5 + k * 0.5);
    } else if (tt < T_DREAM) {
      // 4. na margem: por cima do ombro, aproximando, olhando a clareira vazia
      // por cima do ombro: atrás do Bloop, alto o bastante para ver a clareira por cima da margem
      const k = ease((tt - T_LAND) / (T_DREAM - T_LAND));
      const far = at(P.shore, 24, -3, 0);
      const dl = new THREE.Vector3(far.x - hp.x, 0, far.z - hp.z).normalize();
      look.copy(hp).addScaledVector(dl, 8);
      look.y = hp.y - 0.4;
      pos.copy(hp).addScaledVector(dl, -(3.8 - k * 1.2)).addScaledVector(s, 0.8);
      pos.y = Math.max(T.heightAt(pos.x, pos.z), P.level, hp.y) + 2.0 - k * 0.3;
      grade = LOOKS.morning;
    } else if (tt < T_BACK) {
      // 5. sonho: noite, acampamento cheio; grua passando por cima
      const k = ease((tt - T_DREAM) / (T_BACK - T_DREAM));
      const cx = P.camp;
      const a0 = Math.atan2(P.shore.x - cx.x, P.shore.z - cx.z);
      const a = a0 - 0.5 + k * 1.1;
      const R = 46 - k * 16;
      pos.set(cx.x + Math.sin(a) * R, cx.y + 26 - k * 14, cx.z + Math.cos(a) * R);
      look.set(cx.x, cx.y + 2, cx.z);
      grade = LOOKS.night;
    } else if (tt < T_TITLE) {
      // 6. close no Bloop feliz perto da fogueira
      const k = ease((tt - T_BACK) / (T_TITLE - T_BACK));
      const front = hp.clone().addScaledVector(new THREE.Vector3(Math.sin(hyaw), 0, Math.cos(hyaw)), 3.4 - k * 0.6);
      pos.copy(front).setY(hp.y + 1.3);
      look.copy(hp).setY(hp.y + 0.75);
      grade = LOOKS.golden;
    } else {
      // 7. grua subindo por trás revelando o vale + título
      const k = ease((tt - T_TITLE) / (T_END - T_TITLE));
      pos.copy(hp).addScaledVector(f, 3.2 + k * 4).addScaledVector(s, 1.2);
      pos.y = hp.y + 1.6 + k * 7;
      look.copy(hp).addScaledVector(f, -26);
      look.y = P.level + 3 + k * 2;
      grade = LOOKS.golden;
    }
    // transições suaves de cor nas viradas de plano
    const dream = tt >= T_DREAM && tt < T_BACK;
    if (dream !== this.dreamOn) this.setDream(dream);
    w.grade(grade);
    cam.position.copy(pos);
    cam.lookAt(look);
    w.follow(look.x, look.z);
    // árvores entre a câmera e o que importa somem (nada de folha na cara)
    w.veg?.occlude(pos.x, pos.z, tt >= T_LETTER && !(tt >= T_DREAM && tt < T_BACK) ? hp.x : look.x, tt >= T_LETTER && !(tt >= T_DREAM && tt < T_BACK) ? hp.z : look.z);
    // sol baixo no amanhecer/fim de tarde (sombras longas)
    const low = tt < T_CANOE || tt >= T_BACK ? 1 : 0.4;
    w.sun.position.set(look.x - f.x * 40 + s.x * 30, 26 + (1 - low) * 50, look.z - f.z * 40 + s.z * 30);
    // ---------------- vida: herói, pássaros, brilhos, fogueira ----------------
    this.hero.update(dt, cam, { yaw: hyaw, speed: hspeed, act, happy });
    const flockOn = tt < T_LAND + 2 || tt >= T_TITLE;
    const fc = new THREE.Vector3();
    const ft = tt < T_LAND + 2 ? tt : tt - T_TITLE;
    fc.copy(at(P.L, -30 + ft * 4.2, -24 + ft * 3.4, P.level + 14 + Math.sin(ft * 0.4) * 2));
    const dir = Math.atan2(f.x * 4.2 + s.x * 3.4, f.z * 4.2 + s.z * 3.4);
    for (const b of this.birds) {
      b.g.visible = flockOn;
      if (!flockOn) continue;
      b.ph += dt * 9;
      const flap = Math.sin(b.ph) * 0.7;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
      b.g.position.copy(fc).add(new THREE.Vector3(b.off.x * Math.cos(dir) + b.off.z * Math.sin(dir), b.off.y + Math.sin(b.ph * 0.13) * 0.3, -b.off.x * Math.sin(dir) + b.off.z * Math.cos(dir)));
      b.g.rotation.y = dir - Math.PI / 2;
    }
    const sunny = dream ? 0 : tt < T_CANOE ? 0.7 : 1;
    for (const sp of this.sparks) {
      const k = Math.max(0, Math.sin(tt * sp.userData.sp + sp.userData.ph));
      (sp.material as THREE.SpriteMaterial).opacity = k * k * k * 0.9 * sunny;
      sp.scale.setScalar(0.25 + k * 0.45);
    }
    this.o.site.update(dt, cam, dream ? 1 : tt < T_LETTER ? 0.4 : 0);
    if (dream) {
      const k = Math.min(1, (tt - T_DREAM) / 1.2);
      (this.stars.material as THREE.PointsMaterial).opacity = k;
      this.stars.position.copy(cam.position);
      for (let i = 0; i < this.glows.length; i++) {
        const g = this.glows[i];
        (g.material as THREE.SpriteMaterial).opacity = k * (0.75 + Math.sin(tt * 2 + i) * 0.15);
      }
      for (const l of this.lights) l.intensity = k * 3;
      for (const mc of this.machines) mc.sync(dt);
    }
    // ---------------- telas (legendas, carta, título, clarões) ----------------
    this.overlays();
    o.r.render(w.scene, cam);
  }

  private overlays(): void {
    const tt = this.time;
    const el = this.el;
    // legendas
    let si = -1;
    for (let i = 0; i < SUBS.length; i++) if (tt >= SUBS[i].t) si = i;
    if (si !== this.subI) {
      this.subI = si;
      const sub = el.querySelector('.gbi-sub') as HTMLElement;
      if (si >= 0) {
        const s = SUBS[si];
        const tx = s.text();
        (sub.querySelector('.gbi-ic') as HTMLElement).innerHTML = s.icons.map((k) => SI[k]).join('');
        (sub.querySelector('.gbi-tx') as HTMLElement).textContent = tx;
        sub.classList.remove('on');
        void sub.offsetWidth;
        sub.classList.add('on');
        speak(tx, { urgent: true });
      }
    }
    el.querySelector('.gbi-letter')!.classList.toggle('on', tt >= T_LETTER && tt < T_CANOE - 0.2);
    el.querySelector('.gbi-title')!.classList.toggle('on', tt >= T_TITLE + 1.4);
    if (tt >= T_TITLE + 1.4 && !this.stingDone) {
      this.stingDone = true;
      music.sting('title');
      sfx.sparkle();
    }
    // clarões brancos (entrar e sair do sonho) e fade final
    const fl = el.querySelector('.gbi-flash') as HTMLElement;
    const d1 = Math.abs(tt - T_DREAM);
    const d2 = Math.abs(tt - T_BACK);
    const fk = Math.max(0, 1 - Math.min(d1, d2) / 0.45);
    fl.style.opacity = (fk * fk).toFixed(3);
    el.querySelector('.gbi-fade')!.classList.toggle('on', tt > T_END - 0.9);
  }

  /** liga/desliga o "sonho": prédios, máquinas, luzes, barras de ouro e estrelas */
  private setDream(on: boolean): void {
    this.dreamOn = on;
    const w = this.o.w;
    const m = w.map;
    this.el.classList.toggle('dream', on);
    this.stars.visible = on;
    if (on) {
      music.setState('victory');
      sfx.sparkle();
      for (const id of ['plant', 'stock', 'garage', 'houses']) {
        this.bldWas.set(id, w.built(id));
        w.setBuilt(id, true);
      }
      // barras de ouro no galpão
      const bars = w.stock.bars;
      this.barsWas = bars.count;
      const m4 = new THREE.Matrix4();
      const n = 120;
      for (let i = 0; i < n; i++) {
        const layer = Math.floor(i / 40);
        const k = i % 40;
        m4.makeTranslation(-2.6 + (k % 10) * 0.55, 1.03 + layer * 0.15, -2.4 + Math.floor(k / 10) * 0.45);
        bars.setMatrixAt(i, m4);
      }
      bars.count = n;
      bars.instanceMatrix.needsUpdate = true;
      // máquinas do sonho
      setLod(this.o.tier <= 1 ? 1 : 0);
      const put = (k: 'excavator' | 'truck' | 'dozer' | 'pickup', x: number, z: number, yaw: number) => {
        const mc = makeMachine(k);
        mc.veh?.place(x, z, yaw, w.T);
        w.scene.add(mc.group);
        mc.sync(0);
        this.machines.push(mc);
      };
      const d0 = m.deposits[0];
      const toC = Math.atan2(m.camp.x - d0.x, m.camp.z - d0.z);
      put('excavator', d0.x + Math.sin(toC) * 8, d0.z + Math.cos(toC) * 8, toC + Math.PI);
      put('truck', m.camp.x + 4, m.camp.z + 2, Math.atan2(m.plant.x - m.camp.x, m.plant.z - m.camp.z));
      put('dozer', m.garage.x + 6, m.garage.z + 13, 0.4);
      if (this.o.tier >= 2) put('pickup', m.garage.x - 6, m.garage.z + 13, -0.3);
      // luzes quentes: poucos pontos de luz (qualidade) + halos
      const tex = glowTexture();
      const spots: [number, number, number][] = [
        [m.plant.x, m.plant.z, 7.5],
        [m.garage.x, m.garage.z, 6],
        [m.stock.x, m.stock.z, 5],
        [m.camp.x, m.camp.z, 5],
        ...m.houses.map((h) => [h.x, h.z, 4.6] as [number, number, number]),
      ];
      for (const [x, z, y] of spots) {
        const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffcf7a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        g.position.set(x, w.T.heightAt(x, z) + y, z);
        g.scale.setScalar(7);
        this.group.add(g);
        this.glows.push(g);
      }
      const nl = [0, 1, 2, 3][this.o.tier] ?? 1;
      for (let i = 0; i < nl && i < spots.length; i++) {
        const [x, z, y] = spots[i];
        const l = new THREE.PointLight(0xffc070, 0, 40, 1.2);
        l.position.set(x, w.T.heightAt(x, z) + y, z);
        this.group.add(l);
        this.lights.push(l);
      }
    } else {
      this.undream();
      music.setState('calm');
    }
  }
  private undream(): void {
    const w = this.o.w;
    for (const [id, was] of this.bldWas) w.setBuilt(id, was);
    this.bldWas.clear();
    if (w.stock) {
      w.stock.bars.count = this.barsWas;
      w.stock.bars.instanceMatrix.needsUpdate = true;
    }
    for (const mc of this.machines) {
      mc.group.removeFromParent();
      mc.dispose();
    }
    this.machines = [];
    for (const g of this.glows) {
      g.removeFromParent();
      g.material.dispose();
    }
    this.glows = [];
    for (const l of this.lights) {
      l.removeFromParent();
      l.dispose();
    }
    this.lights = [];
  }

  /** carta/mapa do vovô (canvas 2D): papel envelhecido, montanha, rio, trilha, X e pepita */
  private drawLetter(cv: HTMLCanvasElement): void {
    const W = 520;
    const H = 380;
    cv.width = W;
    cv.height = H;
    const x = cv.getContext('2d')!;
    // papel com bordas queimadas
    const g = x.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, '#fbeec8');
    g.addColorStop(0.75, '#efd59a');
    g.addColorStop(1, '#b9874a');
    x.fillStyle = g;
    x.beginPath();
    let rs = 7;
    const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    const pts: [number, number][] = [];
    for (let i = 0; i < 40; i++) pts.push([10 + (i / 39) * (W - 20), 10 + rnd() * 8]);
    for (let i = 0; i < 30; i++) pts.push([W - 10 - rnd() * 8, 10 + (i / 29) * (H - 20)]);
    for (let i = 0; i < 40; i++) pts.push([W - 10 - (i / 39) * (W - 20), H - 10 - rnd() * 8]);
    for (let i = 0; i < 30; i++) pts.push([10 + rnd() * 8, H - 10 - (i / 29) * (H - 20)]);
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(110,60,20,.55)';
    x.lineWidth = 3;
    x.stroke();
    // montanha
    x.fillStyle = '#c4632e';
    x.strokeStyle = '#6a2e10';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(260, 250);
    x.lineTo(340, 95);
    x.lineTo(380, 150);
    x.lineTo(420, 115);
    x.lineTo(490, 250);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(340, 95);
    x.lineTo(356, 126);
    x.lineTo(340, 118);
    x.lineTo(326, 124);
    x.closePath();
    x.fill();
    // rio
    x.strokeStyle = '#3f8fd0';
    x.lineWidth = 14;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(30, 330);
    x.bezierCurveTo(120, 300, 140, 250, 220, 270);
    x.bezierCurveTo(280, 285, 300, 330, 380, 340);
    x.stroke();
    // árvores
    for (let i = 0; i < 7; i++) {
      const tx = 40 + i * 30 + (i % 2) * 8;
      const ty = 230 - (i % 3) * 14;
      x.fillStyle = '#3f8a3a';
      x.beginPath();
      x.arc(tx, ty, 13, 0, TAU);
      x.fill();
      x.fillStyle = '#6a3a1a';
      x.fillRect(tx - 2, ty + 10, 4, 10);
    }
    // trilha pontilhada até o X
    x.setLineDash([8, 9]);
    x.strokeStyle = '#c21d1d';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(120, 310);
    x.bezierCurveTo(200, 250, 270, 220, 372, 176);
    x.stroke();
    x.setLineDash([]);
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(358, 162);
    x.lineTo(386, 190);
    x.moveTo(386, 162);
    x.lineTo(358, 190);
    x.stroke();
    // pepita com brilho
    x.fillStyle = '#ffcf2e';
    x.strokeStyle = '#9a6400';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(398, 150);
    x.lineTo(412, 136);
    x.lineTo(430, 140);
    x.lineTo(434, 156);
    x.lineTo(418, 166);
    x.closePath();
    x.fill();
    x.stroke();
    x.strokeStyle = '#fff';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(440, 128);
    x.lineTo(440, 112);
    x.moveTo(432, 120);
    x.lineTo(448, 120);
    x.stroke();
    // retratinho do vovô (Bloop de chapéu e bigode) num canto
    x.save();
    x.translate(84, 92);
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.arc(0, 0, 42, 0, TAU);
    x.fill();
    x.strokeStyle = '#6a3a1a';
    x.lineWidth = 3;
    x.stroke();
    x.fillStyle = '#c87a2a';
    x.beginPath();
    x.ellipse(0, -30, 54, 12, 0, 0, TAU);
    x.fill();
    x.fillRect(-28, -62, 56, 34);
    x.fillStyle = '#3a2410';
    x.beginPath();
    x.arc(-14, -4, 5, 0, TAU);
    x.arc(14, -4, 5, 0, TAU);
    x.fill();
    x.fillStyle = '#f3efe6';
    x.beginPath();
    x.ellipse(-10, 14, 14, 6, 0.3, 0, TAU);
    x.ellipse(10, 14, 14, 6, -0.3, 0, TAU);
    x.fill();
    x.restore();
    // escrita (curta, traduzida)
    x.fillStyle = '#4a2a10';
    x.font = `700 30px Fredoka, 'Comic Sans MS', cursive`;
    x.textAlign = 'left';
    x.fillText(t('gb.i.letter', 'Tem ouro na montanha!'), 146, 76);
    x.font = `600 24px Fredoka, 'Comic Sans MS', cursive`;
    x.fillText('— ' + t('gb.i.grandpa', 'Vovô'), 160, 116);
  }

  finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    hush();
    this.undream();
    this.restoreGrade();
    this.hero.dispose();
    this.group.removeFromParent();
    this.group.traverse((ob) => {
      const mm = ob as THREE.Mesh;
      if (mm.geometry && ob !== this.hero.root) mm.geometry.dispose();
    });
    for (const h of this.hidden) h.visible = true;
    this.o.site.showTags(true);
    this.o.wrap.classList.remove('gbi-playing');
    this.el.classList.add('out');
    window.setTimeout(() => this.el.remove(), 450);
    music.play('garimpo', 1.5);
    this.done();
  }
}

/** no jogo novo: usa o mundo e o renderizador do jogo */
let current: Cinematic | null = null;
export function playInGame(wrap: HTMLElement, r: THREE.WebGLRenderer, w: World, site: Site, tier: number, hide: THREE.Object3D[] = []): Promise<void> {
  const c = new Cinematic({ wrap, r, w, site, tier, hide });
  current = c;
  return c.run().finally(() => {
    if (current === c) current = null;
  });
}
/** botão "voltar" do aparelho durante a abertura = pular */
export function skipIntro(): void {
  current?.finish();
}

/** do menu: mundo de exemplo só para a abertura (sem jogo) */
export async function playStandalone(wrap: HTMLElement, tier: number, back: () => void): Promise<void> {
  const ld = document.createElement('div');
  ld.className = 'gb-scr';
  ld.innerHTML = '<div class="gb-spin"></div>';
  wrap.appendChild(ld);
  await new Promise((r) => setTimeout(r, 30));
  const cv = document.createElement('canvas');
  cv.className = 'gb-cv';
  wrap.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [0.75, 0.9, 1.1, 1.5][tier as 0 | 1 | 2 | 3] ?? 1));
  const W = wrap.clientWidth || 1;
  const H = wrap.clientHeight || 1;
  r.setSize(W, H, false);
  setLod(tier <= 1 ? 1 : 0);
  const w = new World();
  w.build(20251111, tier as 0 | 1 | 2 | 3);
  for (const id of ['plant', 'stock', 'garage', 'houses', 'portal']) w.setBuilt(id, false);
  const site = new Site(w, tier, false);
  ld.remove();
  try {
    await playInGame(wrap, r, w, site, tier);
  } finally {
    site.dispose();
    w.dispose();
    r.dispose();
    r.forceContextLoss();
    cv.remove();
    music.play('garimpo', 1);
    back();
  }
}
