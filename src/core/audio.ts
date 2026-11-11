/* ============================================================
 *  core/audio — FACHADA de compatibilidade do áudio do app.
 *  Toda a parte real mora em src/audio/ (motor, pacotes por jogo, música
 *  procedural adaptativa, ambiente). Os métodos antigos (click, coin, hit…)
 *  continuam iguais para os jogos, mas agora tocam o som do PACOTE do jogo
 *  aberto (cada jogo soa diferente) com variação, limite de vozes e cache.
 *  Internos usados por outros módulos (ctx, sfxBus, musicBus, master, reverb)
 *  apontam para os barramentos do motor novo.
 * ============================================================ */
import { engine } from '../audio/engine';
import { activePack, getPack, play } from '../audio/sound';
import { music } from '../audio/music';
import { Motor } from '../audio/ambience';
import '../audio/glue';
import { save } from './storage';

const LAND = [523, 587, 659, 784, 880, 1047, 1175, 1319];

class Sfx {
  get ctx(): AudioContext | null {
    return engine.ctx;
  }
  get master(): GainNode {
    return engine.master;
  }
  get sfxBus(): GainNode {
    return engine.sfxIn;
  }
  get musicBus(): GainNode {
    return engine.musicIn;
  }
  get reverb(): AudioNode {
    return engine.sfxRev;
  }

  unlock(): void {
    engine.unlock();
  }

  applySettings(): void {
    engine.applySettings();
  }

  suspend(): void {
    engine.suspend();
  }
  resume(): void {
    engine.resume();
  }

  /** saída de efeitos (respeita "Som") para sons sintetizados fora daqui (intro 3D, jogos com áudio próprio) */
  fxOut(): { ctx: AudioContext; out: AudioNode; rev: AudioNode } | null {
    return engine.ctx && save.sound ? { ctx: engine.ctx, out: engine.sfxIn, rev: engine.sfxRev } : null;
  }

  /** 0..1: música adaptativa (>0.55 = camada de tensão) */
  setIntensity(v: number): void {
    music.setIntensity(v);
  }

  jump(combo = 0): void {
    play('jump', { rate: Math.pow(1.03, Math.min(combo, 20)) });
  }
  land(combo = 0): void {
    play('land', { rate: LAND[Math.min(combo, LAND.length - 1)] / 523 });
  }
  perfect(combo = 0): void {
    play('perfect', { rate: Math.pow(1.06, Math.min(combo, 12)) });
  }
  coin(chain = 0): void {
    play('coin', { rate: Math.pow(1.06, chain % 12) });
  }
  gem(): void {
    play('gem');
  }
  crack(): void {
    play('crack');
  }
  hit(): void {
    play('hit');
  }
  click(): void {
    play('click');
  }
  unlock2(): void {
    play('unlock2');
  }
  cash(): void {
    play('cash');
  }
  /** Alerta (sobe e desce) ~dur s. Avisa ANTES do perigo. Cada jogo tem o seu (Voo = aviso de bordo). */
  siren(dur = 2.4): void {
    const h = play('siren', { force: true });
    if (h && dur < 2.3) window.setTimeout(() => h.stop(0.3), Math.max(0, dur - 0.3) * 1000);
  }
  tick(i = 0): void {
    play('tick', { rate: Math.pow(1.04, Math.min(i, 24)) });
  }
  nearMiss(): void {
    play('nearMiss');
  }
  record(): void {
    play('record');
  }
  fail(): void {
    play('fail');
  }

  /* ----------- motor (Rally, Garimpo, Voo…): timbre vem do pacote do jogo ----------- */
  private eng: Motor | null = null;
  engineStart(): void {
    if (this.eng || !engine.ctx) return;
    const pre = getPack(activePack())?.motor ?? { kind: 'kart' as const, idle: 42, top: 140, vol: 0.085 };
    this.eng = new Motor(pre);
  }
  /** throttle 0..1 (acelerador), speed 0..1 (velocidade relativa). */
  engineSet(throttle: number, speed: number): void {
    this.eng?.set(save.sound ? throttle : 0, speed);
  }
  engineStop(): void {
    this.eng?.stop();
    this.eng = null;
  }

  dispose(): void {
    music.play(null);
  }
}

export const audio = new Sfx();
