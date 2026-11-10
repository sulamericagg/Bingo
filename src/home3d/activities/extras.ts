/* ============================================================
 *  CASA 3D · ATIVIDADES — EXTRAS
 *  TV com canais animados (mini tela), música (caixa de som/piano/violão),
 *  banho de banheira, descarga, selfie no espelho (polaroide) e a HORTA:
 *  plantar → regar → cresce em tempo real → colher legumes frescos.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { save } from '../../core/storage';
import { sfx } from '../sfx';
import type { ItemRec } from '../engine';
import type { ActDef } from '../ui';
import { hitBox, itemHit, v3, type Ctx, type Spot } from './core';
import { GARDEN_SEEDS, ingName, RECIPES } from './data';
import { planterGeo, sproutGeo, tubBubblesGeo } from './models';
import { Fixture, freeSpot, Rig } from './spots';
import { AS, bump, saveAct } from './store';
import { ingColor } from './ui';

const V = new THREE.Vector3();

/* ---------------- música (sintetizada, sem arquivos) ---------------- */
class Music {
  private ac: AudioContext | null = null;
  private tm = 0;
  private step = 0;
  on = false;
  start(): void {
    if (this.on) return;
    this.on = true;
    if (!save.music && !save.sound) return;
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = this.ac ?? new C();
      void this.ac.resume();
    } catch {
      this.ac = null;
      return;
    }
    const bass = [130.8, 130.8, 174.6, 174.6, 196, 196, 146.8, 164.8];
    const mel = [523, 659, 784, 659, 698, 880, 784, 0, 659, 784, 1047, 784, 698, 587, 659, 0];
    this.tm = window.setInterval(() => {
      const ac = this.ac;
      if (!ac) return;
      const s = this.step++;
      const tt = ac.currentTime + 0.02;
      const note = (f: number, dur: number, type: OscillatorType, vol: number) => {
        if (!f) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(vol, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        o.connect(g).connect(ac.destination);
        o.start(tt);
        o.stop(tt + dur + 0.02);
      };
      if (s % 2 === 0) note(bass[(s >> 1) % bass.length], 0.25, 'triangle', 0.09);
      note(mel[s % mel.length], 0.14, 'square', 0.025);
      if (s % 4 === 2) note(2200, 0.03, 'square', 0.015);
    }, 170);
  }
  stop(): void {
    this.on = false;
    clearInterval(this.tm);
  }
  dispose(): void {
    this.stop();
    try {
      void this.ac?.close();
    } catch {
      /* */
    }
    this.ac = null;
  }
}

/* ---------------- TV ---------------- */
class Tv {
  rig: Rig;
  on = false;
  ch = 0;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private screen: THREE.Mesh;
  private drawT = 0;
  spot: Spot;
  constructor(
    readonly x: Extras,
    readonly item: ItemRec,
  ) {
    this.rig = new Rig(x.ctx.eng, item);
    this.cv = document.createElement('canvas');
    this.cv.width = 192;
    this.cv.height = 112;
    this.cx = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const { w, h } = this.rig;
    const sh = item.kind === 'tv' ? h - 0.65 : (h - 0.15) * 0.8;
    const sw = item.kind === 'tv' ? w * 0.82 : w * 0.86;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    if (item.kind === 'tv') this.screen.position.set(0, 0.5 + (h - 0.55) / 2, 0.043);
    else this.screen.position.set(0, 0.15 + (h - 0.15) / 2, -0.017);
    this.screen.visible = false;
    this.rig.root.add(this.screen);
    this.spot = {
      id: 'tv',
      hit: (_r, tg) => itemHit(item, tg),
      label: () => t('home3d.furn.' + item.kind, item.info.name) + (this.on ? ' · ' + this.chName() : ''),
      acts: (hd) =>
        hd || item.state === 'broken'
          ? []
          : this.on
            ? [
                { id: 'x-ch', label: t('act.btn.channel', 'MUDAR CANAL'), icon: 'rotate', size: 'big' },
                { id: 'x-tv', label: t('act.btn.tvOff', 'DESLIGAR'), icon: 'exit', size: 'small' },
              ]
            : [{ id: 'x-tv', label: item.kind === 'tv' ? t('act.btn.tvOn', 'LIGAR TV') : t('act.btn.pcOn', 'LIGAR'), icon: 'eye', size: 'big' }],
      tap: (id) => {
        if (id === 'x-tv') {
          this.on = !this.on;
          this.screen.visible = this.on;
          sfx.click();
          return true;
        }
        if (id === 'x-ch') {
          this.ch = (this.ch + 1) % 4;
          sfx.click();
          return true;
        }
        return false;
      },
    };
  }
  chName(): string {
    return [t('act.tv.cartoon', 'Desenho'), t('act.tv.cooking', 'Culinária'), t('act.tv.game', 'Videogame'), t('act.tv.news', 'Jornal')][this.ch];
  }
  update(dt: number): void {
    this.rig.follow();
    if (!this.on) return;
    const cam = this.x.ctx.eng.camera.position;
    if (cam.distanceTo(this.rig.root.position) > 7) return;
    this.drawT -= dt;
    if (this.drawT > 0) return;
    this.drawT = 1 / 12;
    const c = this.cx;
    const W = 192,
      H = 112;
    const tm = this.x.ctx.eng.time;
    if (this.ch === 0) {
      c.fillStyle = '#7fd0ff';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#4fd67a';
      c.fillRect(0, 84, W, 28);
      const bx = ((tm * 50) % (W + 40)) - 20;
      const by = 70 - Math.abs(Math.sin(tm * 4)) * 40;
      c.fillStyle = '#ff7ad9';
      c.beginPath();
      c.ellipse(bx, by, 16, 14 - Math.abs(Math.cos(tm * 4)) * 3, 0, 0, 7);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(bx + 5, by - 3, 4, 0, 7);
      c.fill();
      c.fillStyle = '#2a0b5c';
      c.beginPath();
      c.arc(bx + 6, by - 3, 2, 0, 7);
      c.fill();
      c.fillStyle = '#ffe27a';
      for (let i = 0; i < 5; i++) c.fillRect((i * 47 + tm * 10) % W, 12 + (i % 2) * 10, 4, 4);
    } else if (this.ch === 1) {
      c.fillStyle = '#ffe9c9';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ff5c7a';
      c.fillRect(0, 0, W, 20);
      c.fillStyle = '#fff';
      c.font = 'bold 12px system-ui,sans-serif';
      const r = RECIPES[Math.floor(tm / 6) % RECIPES.length];
      c.fillText(t('act.tv.today', 'Receita do dia'), 6, 14);
      c.fillStyle = '#2a0b5c';
      c.font = 'bold 13px system-ui,sans-serif';
      c.fillText(r.hint().slice(0, 30), 6, 100);
      c.fillStyle = '#2e2a40';
      c.beginPath();
      c.ellipse(96, 62, 34, 12, 0, 0, 7);
      c.fill();
      c.fillStyle = '#ffc21f';
      c.beginPath();
      c.arc(90 + Math.sin(tm * 6) * 8, 56 - Math.abs(Math.sin(tm * 6)) * 14, 7, 0, 7);
      c.fill();
    } else if (this.ch === 2) {
      c.fillStyle = '#1a0840';
      c.fillRect(0, 0, W, H);
      const px = 96 + Math.sin(tm * 2.3) * 80;
      const py = 56 + Math.sin(tm * 3.1) * 44;
      c.fillStyle = '#46d9e6';
      c.fillRect(8, py - 14 + Math.sin(tm * 2) * 4, 5, 28);
      c.fillStyle = '#ff7ad9';
      c.fillRect(W - 13, py - 14 - Math.sin(tm * 2.2) * 4, 5, 28);
      c.fillStyle = '#ffe27a';
      c.fillRect(px - 3, py - 3, 6, 6);
      c.fillStyle = '#ffffff55';
      for (let y = 0; y < H; y += 10) c.fillRect(W / 2 - 1, y, 2, 5);
    } else {
      c.fillStyle = '#3fa0ff';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff';
      c.fillRect(0, 80, W, 32);
      c.fillStyle = '#d8322e';
      c.fillRect(0, 80, 46, 32);
      c.fillStyle = '#fff';
      c.font = 'bold 11px system-ui,sans-serif';
      c.fillText(t('act.tv.live', 'AO VIVO'), 4, 100);
      c.fillStyle = '#2a0b5c';
      const news = [t('act.tv.n1', 'Pipoca invade cozinha!'), t('act.tv.n2', 'Liquidificador sem tampa ataca de novo'), t('act.tv.n3', 'Bloop bate recorde de louça lavada'), t('act.tv.n4', 'Balões fogem para o teto')];
      const s = news[Math.floor(tm / 5) % news.length];
      c.fillText(s, 52 - ((tm * 30) % 60), 100);
      c.fillStyle = '#ffe27a';
      c.beginPath();
      c.arc(150, 38, 18, 0, 7);
      c.fill();
    }
    this.tex.needsUpdate = true;
    // assistir diverte (olhando e perto)
    if (cam.distanceTo(this.rig.root.position) < 4) bump('fun', 0.05);
  }
  dispose(): void {
    this.tex.dispose();
    this.screen.geometry.dispose();
    (this.screen.material as THREE.Material).dispose();
    this.rig.dispose();
  }
}

/* ---------------- horta ---------------- */
class Garden {
  fx: Fixture;
  sprouts: (THREE.Mesh | null)[] = [null, null, null];
  private shown: string[] = ['', '', ''];
  private water = 0;
  spot: Spot;
  static GROW_MS = 5 * 60 * 1000;
  constructor(
    readonly x: Extras,
    fx: Fixture,
  ) {
    this.fx = fx;
    fx.root.add(new THREE.Mesh(planterGeo(), x.mat));
    const min = v3(-0.52, 0, -0.22),
      max = v3(0.52, 0.6, 0.22);
    this.spot = {
      id: 'garden',
      hit: (ray) => hitBox(ray, fx.root, min, max),
      label: () => t('act.lbl.garden', 'Horta') + ' · ' + this.status(),
      acts: (h) => {
        if (h) return [];
        const L: ActDef[] = [];
        if (this.ripe().length) L.push({ id: 'g-harvest', label: t('act.btn.harvest', 'COLHER'), icon: 'grab', size: 'big' as const });
        if (AS.plots.some((p) => p.seed && p.watered < p.planted)) L.push({ id: 'g-water', label: t('act.btn.water', 'REGAR'), icon: 'drop', size: L.length ? undefined : ('big' as const), hold: true });
        if (AS.plots.some((p) => !p.seed)) L.push({ id: 'g-plant', label: t('act.btn.plant', 'PLANTAR'), icon: 'plus', size: L.length ? undefined : ('big' as const) });
        return L;
      },
      tap: (id) => {
        if (id === 'g-plant') {
          this.x.ctx.ui.openPick(
            GARDEN_SEEDS.map((s) => ({ id: s, label: ingName(s), color: ingColor(s) })),
            (s) => {
              const plot = AS.plots.find((p) => !p.seed);
              if (plot) {
                plot.seed = s;
                plot.planted = Date.now();
                plot.watered = 0;
                saveAct();
                sfx.drop();
                this.x.ctx.ui.hint(t('act.hint.planted', 'Plantado! Agora regue'), 1600);
              }
              if (!AS.plots.some((p) => !p.seed)) this.x.ctx.ui.closePick();
            },
          );
          return true;
        }
        if (id === 'g-harvest') return this.harvest(), true;
        return false;
      },
      hold: (id, dt) => {
        if (id !== 'g-water') return;
        this.x.ctx.pose('grab');
        this.water += dt;
        const p = this.fx.world((Math.random() - 0.5) * 0.8, 0.5, 0, V);
        this.x.ctx.eng.emit(p.x, p.y + 0.3, p.z, 0, -1, 0, { tile: 0, color: '#6fd0ff', life: 0.35, size: 0.03, grav: 6 });
        if (this.water > 1.2) {
          this.water = 0;
          const now = Date.now();
          for (const pl of AS.plots) if (pl.seed && pl.watered < pl.planted) pl.watered = now;
          saveAct();
          sfx.sparkle();
          this.x.ctx.ui.hint(t('act.hint.gardenWatered', 'Regado! Volte daqui a pouco para colher'), 2000);
        }
      },
    };
  }
  /** 0..1 crescimento (só cresce depois de regado) */
  growth(i: number): number {
    const p = AS.plots[i];
    if (!p.seed || p.watered < p.planted) return 0;
    return Math.min(1, (Date.now() - p.watered) / Garden.GROW_MS);
  }
  ripe(): number[] {
    return AS.plots.map((_, i) => i).filter((i) => AS.plots[i].seed && this.growth(i) >= 1);
  }
  status(): string {
    const pl = AS.plots.filter((p) => p.seed);
    if (!pl.length) return t('act.lbl.gardenEmpty', 'vazia');
    if (this.ripe().length) return t('act.lbl.ripe', 'pronto pra colher!');
    if (pl.some((p) => p.watered < p.planted)) return t('act.lbl.thirsty', 'com sede');
    const g = Math.max(...AS.plots.map((_, i) => this.growth(i)));
    return t('act.lbl.growing', 'crescendo {p}%', { p: Math.round(g * 100) });
  }
  private harvest(): void {
    const ctx = this.x.ctx;
    for (const i of this.ripe()) {
      const seed = AS.plots[i].seed!;
      for (let k = 0; k < 2; k++) ctx.props.spawn('ing', { ing: seed, garden: true }, this.fx.world(-0.33 + i * 0.33, 0.6 + k * 0.1, 0), this.fx.world(0, 0, 1).sub(this.fx.root.position).multiplyScalar(1.2).setY(2.2));
      AS.plots[i] = { seed: null, planted: 0, watered: 0 };
    }
    saveAct();
    sfx.catch();
    const got = ctx.coin(2);
    ctx.ui.hint(t('act.hint.harvest', 'Colheita fresquinha! (vale estrela extra)') + (got ? ' +' + got : ''), 2200);
  }
  update(): void {
    for (let i = 0; i < 3; i++) {
      const p = AS.plots[i];
      const g = this.growth(i);
      const stage = !p.seed ? -1 : g >= 1 ? 2 : g >= 0.4 ? 1 : 0;
      const key = p.seed ? p.seed + stage : '';
      if (key === this.shown[i]) continue;
      this.shown[i] = key;
      if (this.sprouts[i]) this.fx.root.remove(this.sprouts[i]!);
      this.sprouts[i] = null;
      if (stage >= 0) {
        const m = new THREE.Mesh(sproutGeo(stage, p.seed!), this.x.mat);
        m.position.set(-0.33 + i * 0.33, 0.33, 0);
        this.fx.root.add(m);
        this.sprouts[i] = m;
      }
    }
  }
  dispose(): void {
    this.fx.dispose();
  }
}

export class Extras {
  readonly mat: THREE.Material;
  music = new Music();
  tvs: Tv[] = [];
  garden: Garden | null = null;
  private simple: { item: ItemRec; spot: Spot }[] = [];
  private tubFx: { rig: Rig; m: THREE.Mesh; t: number } | null = null;
  constructor(readonly ctx: Ctx) {
    this.mat = ctx.props.newMat();
    this.refresh(true);
  }
  refresh(first = false): void {
    const ctx = this.ctx;
    for (const tv of [...this.tvs]) if (!tv.rig.alive) (tv.dispose(), this.tvs.splice(this.tvs.indexOf(tv), 1));
    for (const it of ctx.items(['tv', 'computer', 'arcade'])) if (!this.tvs.some((x) => x.item === it) && it.kind !== 'arcade') this.tvs.push(new Tv(this, it));
    this.simple = this.simple.filter((s) => ctx.eng.items.includes(s.item));
    for (const it of ctx.items(['speaker', 'piano', 'guitar', 'arcade', 'bathtub', 'toilet', 'mirror'])) if (!this.simple.some((s) => s.item === it)) this.simple.push({ item: it, spot: this.simpleSpot(it) });
    if (first) {
      const room = ctx.eng.roomById('kitchen') ?? ctx.eng.rooms[0];
      let sp = freeSpot(ctx.eng, room, 1.0, 0.4);
      let r = room;
      if (!sp) {
        r = ctx.eng.roomById('living') ?? room;
        sp = freeSpot(ctx.eng, r, 1.0, 0.4);
      }
      if (sp) this.garden = new Garden(this, new Fixture(ctx.eng, r, sp.p, sp.yaw, { w: 1.0, d: 0.4, h: 0.34 }));
    }
  }
  private simpleSpot(item: ItemRec): Spot {
    const ctx = this.ctx;
    const k = item.kind;
    return {
      id: 'x-' + k,
      hit: (_r, tg) => itemHit(item, tg),
      label: () => t('home3d.furn.' + k, item.info.name) + ((k === 'speaker' || k === 'piano' || k === 'guitar') && this.music.on ? ' · ♪' : ''),
      acts: (h) => {
        if (h || item.state === 'broken') return [];
        if (k === 'speaker' || k === 'piano' || k === 'guitar') return [{ id: 'x-music', label: this.music.on ? t('act.btn.musicOff', 'PARAR MÚSICA') : t('act.btn.musicOn', 'TOCAR MÚSICA'), icon: 'party', size: 'big' }];
        if (k === 'arcade') return [{ id: 'x-arcade', label: t('act.btn.arcade', 'JOGAR'), icon: 'emote', size: 'big' }];
        if (k === 'bathtub') return [{ id: 'x-bath', label: t('act.btn.bath', 'TOMAR BANHO'), icon: 'clean', size: 'big' }];
        if (k === 'toilet') return [{ id: 'x-flush', label: t('act.btn.flush', 'DESCARGA'), icon: 'drop', size: 'big' }];
        if (k === 'mirror') return [{ id: 'x-selfie', label: t('act.btn.selfie', 'SELFIE'), icon: 'eye', size: 'big' }];
        return [];
      },
      tap: (id) => {
        switch (id) {
          case 'x-music':
            if (this.music.on) this.music.stop();
            else (this.music.start(), bump('fun', 5), ctx.ui.hint(t('act.hint.music', 'Música na casa!'), 1400));
            sfx.click();
            return true;
          case 'x-arcade':
            sfx.sparkle();
            bump('fun', 10);
            ctx.ui.showCard(t('act.card.arcade', 'Recorde: {n} pontos!', { n: 1000 + Math.floor(Math.random() * 9000) }), 0, t('act.card.arcadeSub', 'Diversão +10'), 1800);
            return true;
          case 'x-bath':
            this.bath(item);
            return true;
          case 'x-flush': {
            const p = item.obj.position;
            ctx.eng.burst(p.x, 0.45, p.z, 14, 'foam', '#8fd3ff', 0.8);
            sfx.whoosh();
            setTimeout(() => sfx.bubble(), 200);
            ctx.ui.hint(t('act.hint.flush', 'Fluuush!'), 1000);
            bump('hyg', 3);
            return true;
          }
          case 'x-selfie':
            this.selfie();
            return true;
        }
        return false;
      },
    };
  }
  private bath(item: ItemRec): void {
    const ctx = this.ctx;
    if (this.tubFx) return;
    const rig = new Rig(ctx.eng, item);
    const m = new THREE.Mesh(tubBubblesGeo(), this.mat);
    m.position.set(0, item.dims.h - 0.02, 0);
    rig.root.add(m);
    this.tubFx = { rig, m, t: 2.6 };
    sfx.bubble();
    void ctx.ui.fade(t('act.bath', 'Esfrega, esfrega... 🫧'), 1800).then(() => {
      bump('hyg', 100);
      ctx.ui.hint(t('act.hint.clean', 'Cheirosinho!'), 1600);
    });
  }
  private selfie(): void {
    const ctx = this.ctx;
    ctx.fps.hand.play('fix');
    sfx.pop();
    ctx.eng.render();
    try {
      const src = ctx.eng.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = Math.round((320 * src.height) / Math.max(1, src.width));
      const g = c.getContext('2d')!;
      g.drawImage(src, 0, 0, c.width, c.height);
      g.fillStyle = '#ffffffcc';
      g.font = 'bold 14px system-ui,sans-serif';
      g.fillText('Bloop World', 8, c.height - 8);
      ctx.ui.flash();
      ctx.ui.photo(c.toDataURL('image/jpeg', 0.82), t('act.selfie', 'Selfie no espelho! #casa'));
      bump('fun', 6);
    } catch {
      ctx.ui.hint(t('act.hint.noPhoto', 'A câmera piscou... tente de novo'), 1400);
    }
  }
  get spots(): Spot[] {
    const L: Spot[] = this.tvs.map((x) => x.spot);
    for (const s of this.simple) L.push(s.spot);
    if (this.garden) L.push(this.garden.spot);
    return L;
  }
  update(dt: number): void {
    for (const tv of this.tvs) tv.update(dt);
    this.garden?.update();
    if (this.tubFx) {
      const f = this.tubFx;
      f.t -= dt;
      f.rig.follow();
      f.m.scale.setScalar(1 + Math.sin(this.ctx.eng.time * 6) * 0.05);
      if (Math.random() < dt * 10) {
        const p = f.rig.world((Math.random() - 0.5) * 1.2, f.rig.h + 0.1, (Math.random() - 0.5) * 0.4, V);
        this.ctx.eng.emit(p.x, p.y, p.z, 0, 0.4, 0, { tile: 0, color: '#d9f2ff', life: 1.4, size: 0.06, grow: 0.05, grav: -0.1 });
      }
      if (f.t <= 0) (f.rig.dispose(), (this.tubFx = null));
    }
    if (this.music.on && Math.random() < dt * 2) bump('fun', 0.2);
  }
  dispose(): void {
    this.music.dispose();
    for (const tv of this.tvs) tv.dispose();
    this.garden?.dispose();
    this.tubFx?.rig.dispose();
  }
}
