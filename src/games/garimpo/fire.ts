/* ============================================================
 *  GARIMPO BRUTO — incêndios (raros; frequentes só no "muito difícil").
 *  Grade de 4 m sobre o mapa: combustível (árvores, casas), calor e umidade.
 *  O fogo anda devagar na direção do acampamento; se chegar no ESTOQUE queima
 *  parte do ouro. Apaga com o balde do helicóptero ou baldes do lago (a pé).
 * ============================================================ */
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { notify } from '../../ui/notify';
import { FIRE_EVERY, type SlotSave } from './save';
import { SIZE } from './terrain';
import type { World } from './world';

const CS = 4;
const G = Math.ceil(SIZE / CS);

interface Host {
  sv: SlotSave | null;
  say(text: string, icon?: 'detector' | 'fire' | null): void;
  alert(text: string | null): void;
  toast(text: string): void;
}

export class Fire {
  private fuel = new Float32Array(G * G);
  private heat = new Float32Array(G * G);
  private wet = new Float32Array(G * G);
  /** árvores por célula */
  private trees: number[][] = [];
  private burning = 0;
  private pts = new Float32Array(90 * 4);
  private stockHit = 0;
  private cx = 0;
  private cz = 0;
  active = false;
  /** rede (anfitrião): começou / apagou / queimou o estoque */
  onEvent: ((k: 'fire' | 'fireOut' | 'stockBurn', n?: number) => void) | null = null;
  private ptsN = 0;

  constructor(
    private w: World,
    s: SlotSave,
  ) {
    void s;
    const m = w.map;
    this.cx = m.camp.x;
    this.cz = m.camp.z;
    for (let i = 0; i < G * G; i++) this.trees.push([]);
    m.trees.forEach((tr, n) => {
      const k = this.cell(tr.x, tr.z);
      this.fuel[k] += tr.kind === 3 ? 0.4 : tr.kind === 4 ? 0 : tr.kind === 5 ? 0.25 : 1;
      this.trees[k].push(n);
    });
    for (const h of m.houses) this.fuel[this.cell(h.x, h.z)] += 1.5;
    this.fuel[this.cell(m.stock.x, m.stock.z)] += 1.2;
    // grama: um pouco de combustível em tudo
    for (let i = 0; i < G * G; i++) this.fuel[i] = Math.min(3, this.fuel[i] + 0.25);
    // a água do helicóptero/baldes
    w.drops.onLand = (x, z) => this.douse(x, z);
  }
  private cell(x: number, z: number): number {
    const i = Math.max(0, Math.min(G - 1, Math.floor(x / CS)));
    const j = Math.max(0, Math.min(G - 1, Math.floor(z / CS)));
    return j * G + i;
  }

  /** começa um incêndio na mata a 30-45 m do acampamento */
  ignite(): void {
    const m = this.w.map;
    let best = -1;
    for (let tries = 0; tries < 200 && best < 0; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 15;
      const k = this.cell(m.camp.x + Math.cos(a) * d, m.camp.z + Math.sin(a) * d);
      if (this.trees[k].length >= 2) best = k;
    }
    if (best < 0) return;
    this.heat[best] = 0.7;
    for (const o of [1, -1, G]) if (this.fuel[best + o] > 0.3) this.heat[best + o] = 0.4;
    this.active = true;
    audio.siren(2.4);
    this.onEvent?.('fire');
    this.host?.say(t('gb.fireStart', 'FOGO na mata! Pegue água no lago e apague!'), 'fire');
  }
  private host: Host | null = null;

  douse(x: number, z: number): void {
    if (!this.active) return;
    const i0 = Math.floor(x / CS);
    const j0 = Math.floor(z / CS);
    for (let j = j0 - 1; j <= j0 + 1; j++)
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        if (i < 0 || j < 0 || i >= G || j >= G) continue;
        const k = j * G + i;
        const f = i === i0 && j === j0 ? 0.09 : 0.03;
        this.heat[k] = Math.max(0, this.heat[k] - f);
        this.wet[k] = 25;
      }
  }

  step(dt: number, host: Host): void {
    this.host = host;
    const s = host.sv!;
    if (!this.active) {
      s.fireT -= dt;
      if (s.fireT <= 0 && s.played > 240) {
        const [a, b] = FIRE_EVERY[s.diff];
        s.fireT = a + Math.random() * (b - a);
        this.ignite();
      }
      return;
    }
    let n = 0;
    let burning = 0;
    const H = this.heat;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const k = j * G + i;
        if (this.wet[k] > 0) this.wet[k] -= dt;
        const h = H[k];
        if (h <= 0) continue;
        burning++;
        // queima combustível; sem combustível apaga
        this.fuel[k] = Math.max(0, this.fuel[k] - dt * 0.012 * h);
        if (this.fuel[k] <= 0.02) {
          H[k] = Math.max(0, h - dt * 0.2);
        } else if (this.wet[k] <= 0) H[k] = Math.min(1, h + dt * 0.05);
        // espalha devagar, puxado para o acampamento (vento)
        if (h > 0.5) {
          const x = (i + 0.5) * CS;
          const z = (j + 0.5) * CS;
          const dc = Math.hypot(x - this.cx, z - this.cz);
          for (let q = 0; q < 4; q++) {
            const ni = i + (q === 0 ? 1 : q === 1 ? -1 : 0);
            const nj = j + (q === 2 ? 1 : q === 3 ? -1 : 0);
            if (ni < 0 || nj < 0 || ni >= G || nj >= G) continue;
            const nk = nj * G + ni;
            if (H[nk] > 0 || this.wet[nk] > 0 || this.fuel[nk] < 0.3) continue;
            const ndc = Math.hypot((ni + 0.5) * CS - this.cx, (nj + 0.5) * CS - this.cz);
            const p = (0.006 + (ndc < dc ? 0.012 : 0)) * this.fuel[nk] * h;
            if (Math.random() < p * dt * 10) H[nk] = 0.15;
          }
        }
        // árvores escurecem
        for (const tn of this.trees[k]) this.w.burnTree(tn, Math.min(1, 1 - this.fuel[k] / 1.2 + h * 0.3));
        if (n < 90) {
          const x = (i + 0.5) * CS;
          const z = (j + 0.5) * CS;
          this.pts[n * 4] = x;
          this.pts[n * 4 + 1] = this.w.T.heightAt(x, z);
          this.pts[n * 4 + 2] = z;
          this.pts[n * 4 + 3] = 0.4 + h * 0.9;
          n++;
        }
      }
    this.burning = burning;
    this.ptsN = n;
    this.w.flames.update(performance.now() / 1000, this.pts, n);
    // estoque pegando fogo
    const m = this.w.map;
    const sk = this.cell(m.stock.x, m.stock.z);
    this.stockHit -= dt;
    if (H[sk] > 0.4 && this.stockHit <= 0 && s.stock > 0) {
      this.stockHit = 10;
      const lost = s.stock * 0.2;
      s.stock -= lost;
      this.onEvent?.('stockBurn', lost);
      notify(t('gb.stockBurn', 'O fogo chegou no estoque! Perdeu {n} g', { n: Math.round(lost) }), { icon: 'fire', kind: 'bad' });
      audio.siren(1.2);
    }
    host.alert(t('gb.fireAlert', 'FOGO! Apague com água'));
    if (burning === 0) {
      this.active = false;
      host.alert(null);
      this.w.flames.update(0, this.pts, 0);
      this.onEvent?.('fireOut');
      const bonus = 250;
      s.money += bonus;
      host.say(t('gb.fireOut', 'Fogo apagado! Muito bem!'));
      host.toast('+' + bonus);
      audio.cash();
    }
  }

  /** célula queimando mais perto do acampamento (para a seta) */
  target(): { x: number; z: number } | null {
    if (!this.active) return null;
    let best = -1;
    let bd = 1e9;
    for (let k = 0; k < G * G; k++) {
      if (this.heat[k] <= 0) continue;
      const x = ((k % G) + 0.5) * CS;
      const z = (Math.floor(k / G) + 0.5) * CS;
      const d = Math.hypot(x - this.cx, z - this.cz);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) return null;
    return { x: ((best % G) + 0.5) * CS, z: (Math.floor(best / G) + 0.5) * CS };
  }
  /** rede: chamas como [x, z, tamanho, ...] */
  netPts(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.ptsN; i++) out.push(Math.round(this.pts[i * 4] * 10) / 10, Math.round(this.pts[i * 4 + 2] * 10) / 10, Math.round(this.pts[i * 4 + 3] * 100) / 100);
    return out;
  }
  get count(): number {
    return this.burning;
  }
  save(s: SlotSave): void {
    void s;
  }
}
