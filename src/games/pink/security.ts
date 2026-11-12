/* ============================================================
 *  BLOOP PINK — segurança da loja.
 *  FURTO: cliente ladrão faz careta, olha para os lados, esconde um produto e sai
 *  andando RETO pelo meio da loja até a porta (dá para ver e barrar). O segurança
 *  (Bloop de uniforme azul-marinho, quepe e óculos escuros) barra: "Opa!" — mas às
 *  vezes está distraído assobiando e o ladrão escapa. O jogador também pode pegar.
 *  ASSALTO: raro (nunca nos 3 primeiros dias), mais provável com muito dinheiro no
 *  caixa e loja aberta até tarde. Assaltante entra e vai ao caixa → minigame curto
 *  (alarme escondido / borrifar perfume). Níveis de segurança (câmeras, alarme,
 *  carro-forte) reduzem até ~0 e deixam automático. Caixa cheio de noite = arrombamento.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { npcSpec } from '../../3d/paper';
import { money, type Product } from './catalog';
import { ic } from './icons';
import { drawerTotal, robberyRisk, takeBag } from './money';
import { Walker } from './npc';
import type { Cust, Shop, Staff } from './shop';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const guardSpec = () => npcSpec('#2c3e6a', '#1a2440', { head: 'h_cap' as never, face: 'f_shades' as never, mouth: 'mo_line' as never });
const robberSpec = () => npcSpec('#3a3440', '#1c1a22', { head: 'h_beanie' as never, face: 'f_mask' as never, eyes: 'e_angry' as never, mouth: 'mo_line' as never });

interface Robber {
  w: Walker;
  st: 'in' | 'counter' | 'game' | 'flee' | 'gone';
  t: number;
}

export class Security {
  /** hora (do dia) em que o assaltante aparece hoje; -1 = hoje não */
  robAt = -1;
  robber: Robber | null = null;
  private guardWhistle = new Map<Staff, number>();
  constructor(private sh: Shop) {}

  /* ------------------------------ furto ------------------------------ */
  /** chance de um cliente novo ser ladrão */
  thiefChance(): number {
    const s = this.sh.s;
    if (s.day < 2) return 0;
    return 0.09 * Math.max(0.1, 1 - s.sec * 0.08);
  }
  /** chamado quando o ladrão "pegou" o produto: esconde, olha para os lados, sai reto */
  startSneak(c: Cust, p: Product): void {
    c.loot = p;
    c.st = 'sneak';
    c.t = 0;
    c.w.path = [];
    this.sh.say(c, 'sneak', 'thief', '', '', 1600);
  }
  /** estados do ladrão; true = tratado aqui */
  update(c: Cust, dt: number): boolean {
    const sh = this.sh;
    const w = c.w;
    if (c.st === 'sneak') {
      // olha para os lados (vira de um lado para o outro) e esconde atrás das costas
      w.yaw += Math.sin(c.t * 7) * dt * 5;
      w.act = c.t < 0.6 ? 0.8 : -1;
      if (c.t > 1.8) {
        c.st = 'escape';
        c.t = 0;
        // reto pelo meio da loja até a porta
        w.speed = 1.6;
        w.go(sh.nav, 0, -1.2);
        w.path.push(new THREE.Vector2(0, 1.6));
      }
      return true;
    }
    if (c.st === 'escape') {
      // segurança perto e atento? barra!
      for (const g of sh.staff) {
        if (g.k !== 'guard') continue;
        if (Math.hypot(g.w.x - w.x, g.w.z - w.z) < 2.2) {
          if ((this.guardWhistle.get(g) ?? 0) > 0) {
            if (!c.said.has('missed')) {
              c.said.add('missed');
              sh.say(g, 'whistle', 'whistle', '♪', '', 1500);
            }
          } else {
            this.catchThief(c, g);
            return true;
          }
        }
      }
      if (w.arrived || w.z > 1.2) {
        // escapou
        c.st = 'leave';
        c.t = 100;
        w.go(sh.nav, c.exitX, 2.8);
        if (c.loot) {
          sh.day.cost += c.loot.cost;
          sh.day.stolen++;
          sh.hud.banner('thief', t('pink.sec.escaped', 'Um ladrão levou {p}!', { p: c.loot.name }), 2400);
          sfx.play('wrong');
        }
        c.loot = null;
      }
      return true;
    }
    if (c.st === 'caught') {
      if (c.t > 1.4) {
        c.st = 'leave';
        c.t = 100;
        w.speed = 1.9;
        w.go(sh.nav, c.exitX, 2.8);
      }
      return true;
    }
    return false;
  }
  /** o ladrão foi barrado (pelo segurança ou pelo jogador): devolve o produto */
  catchThief(c: Cust, by: Staff | null): void {
    const sh = this.sh;
    if (c.st !== 'escape' && c.st !== 'sneak') return;
    c.st = 'caught';
    c.t = 0;
    c.w.path = [];
    sfx.play('opa');
    if (by) {
      by.w.face(c.w.x, c.w.z);
      sh.say(by, 'opa' + c.id, 'guard', t('pink.sec.opa', 'Opa!'), 'good', 1800);
    } else sh.hud.bubble('me', 'guard', t('pink.sec.opa', 'Opa!'), 'good', 1600);
    sh.say(c, 'busted', 'sad', t('pink.sec.sorry', 'Foi mal...'), 'bad', 1800);
    c.w.face(by ? by.w.x : sh.e.fp.x, by ? by.w.z : sh.e.fp.z);
    if (c.loot) {
      // o produto volta (caixinha aberta no chão perto da porta, para repor)
      sh.e.spawnBox(c.loot.id, 1, c.w.x, 0.5, c.w.z - 0.6, { open: true });
      c.loot = null;
    }
    sh.addXp(by ? 6 : 15);
    sh.day.caught++;
    if (!by) sh.hud.banner('guard', t('pink.sec.caught', 'Pegou o ladrãozinho! +XP'), 1800);
  }
  /** jogador mirando num ladrão que está escapando */
  aimThief(ray: THREE.Ray): Cust | null {
    let best: Cust | null = null;
    let bd = 3;
    const v = new THREE.Vector3();
    for (const c of this.sh.custs) {
      if (!c.thief || (c.st !== 'escape' && c.st !== 'sneak')) continue;
      v.set(c.w.x, 0.9, c.w.z).sub(ray.origin);
      const along = v.dot(ray.direction);
      if (along < 0.2 || along > bd) continue;
      if (v.lengthSq() - along * along < 0.55 * 0.55) {
        bd = along;
        best = c;
      }
    }
    return best;
  }

  /* ------------------------------ segurança (funcionário) ------------------------------ */
  guardPost(i: number): [number, number] {
    const side = i % 2 ? 1 : -1;
    const garage = this.sh.store.isGarage;
    return [side * (garage ? 1.7 : 1.6), -1.3];
  }
  guardUpdate(g: Staff, dt: number, idx: number): void {
    const sh = this.sh;
    const w = g.w;
    g.t += dt;
    const [px, pz] = this.guardPost(idx);
    if (g.st === 'idle' || g.st === 'post') {
      if (Math.hypot(w.x - px, w.z - pz) > 0.4 && w.arrived) w.go(sh.nav, px, pz);
      g.st = 'post';
      if (w.arrived) w.face(0, -6);
    }
    // às vezes se distrai assobiando (menos com câmeras / segurança melhor)
    let wh = this.guardWhistle.get(g) ?? 0;
    if (wh > 0) {
      wh -= dt;
      w.act = (g.t * 2) % 1;
      if (wh <= 0) w.act = -1;
      if (Math.floor(g.t / 1.6) !== Math.floor((g.t - dt) / 1.6) && wh > 0) {
        sh.say(g, 'wh' + Math.floor(g.t), 'whistle', '♪', '', 1200);
        sfx.play('whistle', { db: -8 });
      }
    } else if (Math.random() < dt * 0.025 * Math.max(0.15, 1 - sh.s.sec * 0.09)) wh = 5 + Math.random() * 5;
    this.guardWhistle.set(g, Math.max(0, wh));
  }
  get guards(): number {
    return this.sh.staff.filter((x) => x.k === 'guard').length;
  }

  /* ------------------------------ assalto ------------------------------ */
  /** sorteio do dia (ao abrir a loja) */
  rollDay(): void {
    const s = this.sh.s;
    const risk = robberyRisk(drawerTotal(s.till), s.day, s.sec, this.guards, 0.5);
    this.robAt = Math.random() < risk ? 12 + Math.random() * 9.5 : -1;
  }
  tick(dt: number, hour: number): void {
    const sh = this.sh;
    if (this.robAt > 0 && hour >= this.robAt && sh.phase === 'open' && !this.robber) {
      this.robAt = -1;
      this.spawnRobber();
    }
    const r = this.robber;
    if (!r) return;
    r.t += dt;
    const w = r.w;
    if (r.st === 'in') {
      // segurança atento espanta antes de chegar ao caixa
      for (const g of sh.staff)
        if (g.k === 'guard' && (this.guardWhistle.get(g) ?? 0) <= 0 && Math.hypot(g.w.x - w.x, g.w.z - w.z) < 2.6 && Math.random() < 0.85) {
          sh.say(g, 'stop', 'guard', t('pink.sec.stop', 'Parado aí!'), 'good', 2000);
          sfx.play('opa');
          return this.flee(true);
        }
      if (w.arrived) {
        r.st = 'counter';
        r.t = 0;
        sfx.play('alarm', { db: -6 });
        if (sh.s.sec >= 5) {
          // alarme automático + câmeras: ele foge sozinho
          sh.hud.banner('alarm', t('pink.sec.autoAlarm', 'O alarme disparou sozinho! O assaltante fugiu.'), 2600);
          return this.flee(true);
        }
        const near = Math.hypot(sh.e.fp.x - w.x, sh.e.fp.z - w.z) < 9 && sh.e.fp.z < 0.5;
        if (near && !sh.hud.overlay && !sh.tablet) this.minigame();
        else this.robbed();
      }
    } else if (r.st === 'flee') {
      if (w.arrived) {
        w.dispose();
        this.robber = null;
      }
    }
    w.update(dt, sh.e.camera, []);
  }
  private spawnRobber(): void {
    const sh = this.sh;
    const side = Math.random() < 0.5 ? -1 : 1;
    const w = new Walker(robberSpec(), side * 9, 2.8, 0.36);
    w.speed = 1.5;
    w.look = '#3a3440|#1c1a22|h_beanie';
    sh.e.scene.add(w.char.root);
    const ck = sh.furn.find((f) => f.def.group === 'checkout' && f.sv.k !== 'selfcheck') ?? sh.furn.find((f) => f.def.group === 'checkout');
    const [x, z] = ck ? sh.frontOf(ck, 0.9) : [0, -2];
    w.go(sh.nav, x, z);
    this.robber = { w, st: 'in', t: 0 };
    sh.hud.banner('thief', t('pink.sec.robber', 'Cuidado! Um assaltante entrou!'), 2400);
    sfx.play('wrong');
  }
  private flee(scared: boolean): void {
    const r = this.robber;
    if (!r) return;
    const sh = this.sh;
    r.st = 'flee';
    r.w.speed = 2.6;
    r.w.go(sh.nav, (Math.random() < 0.5 ? -1 : 1) * 12, 3);
    if (scared) {
      sh.addXp(30);
      sh.s.rep = Math.min(100, sh.s.rep + 3);
      sh.day.caught++;
    }
  }
  /** perdeu: leva as notas do caixa */
  private robbed(): void {
    const sh = this.sh;
    const v = takeBag(sh.s.till);
    sh.day.robbed += v / 100;
    sh.hud.banner('thief', t('pink.sec.robbed', 'O assaltante levou {v} do caixa!', { v: money(v / 100) }), 3200);
    sfx.play('wrong');
    sh.updateHudStatic();
    this.flee(false);
  }
  /** minigames curtos para evitar o assalto */
  private minigame(): void {
    const r = this.robber!;
    r.st = 'game';
    const sh = this.sh;
    const kind = Math.random() < 0.5 ? 'alarm' : 'spray';
    const d = sh.hud.panel(`<div class="pk-mg ${kind}">
      <h2>${ic('thief', 34)}${esc(t('pink.sec.title', 'Assalto!'))}</h2>
      <div class="mg-help">${ic(kind === 'alarm' ? 'alarm' : 'spray', 26)}${esc(kind === 'alarm' ? t('pink.sec.alarmHelp', 'Aperte o alarme quando ele NÃO estiver olhando!') : t('pink.sec.sprayHelp', 'Borrife perfume nele bem rápido!'))}</div>
      <div class="mg-stage"><div class="rob"><div class="face">${ic('thief', 96)}</div><div class="eye"></div></div><div class="bar"><b></b></div><div class="timer"><b></b></div></div>
      <button class="pk-b ${kind === 'alarm' ? 'o' : 'g'} mg-btn">${ic(kind === 'alarm' ? 'alarm' : 'spray', 34)}${esc(kind === 'alarm' ? t('pink.sec.alarm', 'Alarme') : t('pink.sec.spray', 'Borrifar'))}</button></div>`);
    const btn = d.querySelector('.mg-btn') as HTMLButtonElement;
    const bar = d.querySelector('.bar b') as HTMLElement;
    const tm = d.querySelector('.timer b') as HTMLElement;
    const face = d.querySelector('.rob') as HTMLElement;
    const T = kind === 'alarm' ? 8 : 5;
    const need = kind === 'alarm' ? 3 : 14;
    let got = 0;
    let looking = true;
    let flipT = 0.9;
    let left = T;
    let done = false;
    let last = performance.now();
    const end = (ok: boolean) => {
      if (done) return;
      done = true;
      face.classList.add(ok ? 'run' : 'win');
      window.setTimeout(() => {
        if (sh.hud.overlay === d) sh.hud.closePanel();
        if (ok) {
          sfx.play('alarm');
          sfx.play('sparkle');
          sh.hud.banner('guard', t('pink.sec.saved', 'Ufa! Você espantou o assaltante!'), 2600);
          this.flee(true);
        } else this.robbed();
      }, 700);
    };
    const loop = () => {
      if (done || !d.isConnected) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      left -= dt;
      tm.style.width = Math.max(0, (left / T) * 100) + '%';
      if (kind === 'alarm') {
        flipT -= dt;
        if (flipT <= 0) {
          looking = !looking;
          flipT = looking ? 0.7 + Math.random() * 0.8 : 0.6 + Math.random() * 0.5;
        }
        face.classList.toggle('away', !looking);
      } else {
        got = Math.max(0, got - dt * 1.2);
        bar.style.width = Math.min(100, (got / need) * 100) + '%';
      }
      if (left <= 0) return end(false);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      if (kind === 'alarm') {
        if (looking) {
          sfx.play('wrong');
          return end(false);
        }
        got++;
        sfx.play('ding');
        bar.style.width = (got / need) * 100 + '%';
        looking = true;
        flipT = 0.8 + Math.random() * 0.6;
        if (got >= need) end(true);
      } else {
        got += 1;
        sfx.play('spray');
        face.animate([{ transform: 'scale(1)' }, { transform: 'scale(.92) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 160 });
        if (got >= need) end(true);
      }
    });
  }
  /** noite: muito dinheiro no caixa → pode ser arrombado (nunca nos primeiros dias) */
  overnight(): void {
    const sh = this.sh;
    const s = sh.s;
    const till = drawerTotal(s.till);
    if (s.sec >= 8) {
      // carro-forte leva o dinheiro para o banco toda noite
      const v = takeBag(s.till);
      if (v > 0) {
        s.money += v / 100;
        sh.hud.banner('bank', t('pink.sec.armored', 'Carro-forte levou {v} para o banco.', { v: money(v / 100) }), 2600);
      }
      return;
    }
    const risk = robberyRisk(till, s.day, s.sec, this.guards, 1) * 0.8;
    if (till > 30000 && Math.random() < risk) {
      const v = takeBag(s.till);
      sh.hud.banner('thief', t('pink.sec.breakIn', 'Arrombaram o caixa de noite! Sumiram {v}.', { v: money(v / 100) }), 3600);
      sfx.play('wrong');
    }
  }
  dispose(): void {
    this.robber?.w.dispose();
    this.robber = null;
  }
}
