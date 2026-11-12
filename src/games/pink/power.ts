/* ============================================================
 *  BLOOP PINK — energia do Mercadinho.
 *  Às vezes a luz cai (a partir do dia 2): luzes apagam, geladeiras/freezers param.
 *  Se ficar mais de ~1 hora do jogo sem frio, as carnes e laticínios ESTRAGAM
 *  (somem das prateleiras, viram sacos de lixo fedidos para levar à lixeira).
 *  Melhorias: NO-BREAK (segura o frio por ~45 min) e GERADOR (liga sozinho).
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { money, PROD } from './catalog';
import type { Shop } from './shop';

export const NOBREAK = { price: 1500, lvl: 4 };
export const GENERATOR = { price: 6000, lvl: 8 };

export class Power {
  on = true;
  /** frio funcionando (no-break segura um pouco) */
  cold = true;
  private outAt = -1;
  private outEnd = -1;
  private outStart = -1;
  private genOn = false;
  private spoiled = false;
  constructor(private sh: Shop) {}
  get grocery(): boolean {
    return this.sh.s.kind === 'grocery';
  }
  rollDay(): void {
    const s = this.sh.s;
    this.outAt = -1;
    if (!this.grocery || s.day < 2) return;
    if (Math.random() < 0.35) {
      this.outAt = 9 + Math.random() * 8.5;
      this.outEnd = this.outAt + 0.9 + Math.random() * 1.8;
    }
  }
  /** debug/testes: queda já */
  forceOut(hour: number, dur = 2): void {
    this.outAt = hour;
    this.outEnd = hour + dur;
  }
  tick(hour: number): void {
    if (!this.grocery) return;
    const sh = this.sh;
    const pw = sh.s.pw ?? { nb: false, gen: false };
    if (this.on && this.outAt > 0 && hour >= this.outAt && hour < this.outEnd) {
      // caiu a luz!
      this.on = false;
      this.cold = false;
      this.genOn = false;
      this.spoiled = false;
      this.outStart = hour;
      sfx.play('powerDown');
      sh.e.fpc.addShake(0.15);
      sh.store.setPower(false);
      sh.hud.banner('boltOff', t('pink.pw.out', 'Caiu a luz! As geladeiras pararam!'), 2800);
    }
    if (!this.on) {
      const el = hour - this.outStart;
      if (pw.gen && !this.genOn && el > 0.12) {
        this.genOn = true;
        sfx.play('powerUp');
        sh.store.setPower(true);
        this.cold = true;
        sh.hud.banner('generator', t('pink.pw.gen', 'O gerador ligou sozinho! Tudo funcionando.'), 2600);
      }
      if (!this.genOn) this.cold = pw.nb && el < 0.75;
      if (!this.cold && !this.spoiled && el > (pw.nb ? 1.75 : 1)) this.spoil();
      if (hour >= this.outEnd) {
        this.on = true;
        this.cold = true;
        this.outAt = -1;
        sfx.play('powerUp');
        sh.store.setPower(true);
        if (!this.genOn) sh.hud.banner('bolt', t('pink.pw.back', 'A luz voltou!'), 2000);
      }
    }
  }
  /** carnes e laticínios fora do frio por muito tempo: estragam */
  private spoil(): void {
    this.spoiled = true;
    const sh = this.sh;
    let lost = 0;
    let n = 0;
    for (const f of sh.furn) {
      if (!f.def.cold) continue;
      f.sv.s.forEach((v, i) => {
        if (!v || !PROD[v[0]]?.cold) return;
        lost += PROD[v[0]].cost * v[1];
        n += v[1];
        f.sv.s[i] = null;
      });
      if (n) {
        // saco de lixo fedido + poça na frente do móvel
        const [x, z] = sh.frontOf(f, 0.9);
        sh.spawnTrashAt(x, z);
        sh.e.addDirt(x, z, 'spill', 0.8);
      }
    }
    sh.fieldDirty = true;
    if (!n) return;
    sh.day.cost += lost;
    sfx.play('wrong');
    sh.hud.banner('meat', t('pink.pw.spoiled', 'As carnes estragaram! Prejuízo de {v}. Compre um gerador!', { v: money(lost) }), 3600);
  }
}
