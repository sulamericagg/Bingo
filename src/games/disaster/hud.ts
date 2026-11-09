/* ============================================================
 *  HUD em HTML/CSS: topo (cenário, fase, vivos), cartões de título,
 *  controles na tela, resultado da rodada e resumo da sessão.
 * ============================================================ */
import { celebrateRecord } from '../../ui/record';
import { t, fmt } from '../../i18n';
import { icon } from '../../ui/icons';
import { audio } from '../../core/audio';
import { addCoins } from '../../core/economy';
import { rewardedAvailable, showRewarded } from '../../services/ads';
import type { DisasterGame } from './game';
import { DISASTERS, type DisasterId } from './scenarios';
import { dzIcon } from './icons';

const CSS = `
.dz-root{position:fixed;inset:0;overflow:hidden;background:#0e1a33;touch-action:none;user-select:none;-webkit-user-select:none;font-family:'Fredoka',system-ui,sans-serif;color:#fff}
.dz-canvas{position:absolute;inset:0;display:block}
.dz-hud{position:absolute;inset:0;pointer-events:none}
.dz-top{position:absolute;left:0;right:0;top:0;padding:max(10px,env(safe-area-inset-top)) 10px 0;display:flex;align-items:flex-start;gap:8px}
.dz-btn{pointer-events:auto;border:0;cursor:pointer;font:inherit;color:#fff;background:rgba(30,15,70,.72);border:2px solid rgba(255,255,255,.25);border-radius:14px;display:flex;align-items:center;justify-content:center}
.dz-home{width:44px;height:44px;flex:none}
.dz-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.dz-scn{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.95}
.dz-phase{display:flex;align-items:center;gap:6px;background:linear-gradient(180deg,#ffb03a,#ff6a2e);border:2px solid #2a0b5c;border-radius:14px;padding:3px 12px;font-weight:700;font-size:15px;box-shadow:0 3px 0 #2a0b5c}
.dz-phase.calm{background:linear-gradient(180deg,#5ac8ff,#3f7cff)}
.dz-phase.safe{background:linear-gradient(180deg,#5ee08a,#22a85a)}
.dz-phase b{font-size:18px;min-width:2.2em;text-align:right}
.dz-alive{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.dz-chip{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 8px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:4px}
.dz-card{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);opacity:0;text-align:center;transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .25s;pointer-events:none;width:min(92vw,520px)}
.dz-card.on{transform:translate(-50%,-50%) scale(1);opacity:1}
.dz-card .big{font-size:clamp(30px,9vw,54px);font-weight:700;line-height:1;color:#ffe14d;-webkit-text-stroke:2px #2a0b5c;text-shadow:0 4px 0 #2a0b5c,0 0 24px rgba(255,120,40,.6);letter-spacing:.5px}
.dz-card .sub{margin-top:8px;font-size:clamp(14px,4vw,18px);font-weight:600;background:rgba(30,15,70,.78);display:inline-block;padding:6px 14px;border-radius:14px}
.dz-card>.ico{display:block;margin:0 auto 6px}.dz-card .sub .ico{vertical-align:-3px}
.dz-card.alert .big{color:#fff;text-shadow:0 4px 0 #2a0b5c,0 0 30px rgba(255,40,40,.9)}
.dz-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);background:rgba(30,15,70,.85);border-radius:14px;padding:6px 14px;font-weight:600;font-size:14px;opacity:0;transition:opacity .25s;text-align:center;max-width:86vw}
.dz-toast.on{opacity:1}
.dz-ctrl{position:absolute;left:0;right:0;bottom:0;padding:0 14px max(14px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none}
.dz-ctrl .grp{display:flex;gap:12px}
.dz-pad{pointer-events:auto;width:70px;height:70px;border-radius:50%;background:rgba(30,15,70,.5);border:3px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;touch-action:none}
.dz-pad.on{background:rgba(255,176,58,.6);transform:scale(.94)}
.dz-pad.jump{width:84px;height:84px}
.dz-pad .ico{width:38px;height:38px}
.dz-pad.left .ico{transform:rotate(-90deg)}.dz-pad.right .ico{transform:rotate(90deg)}
.dz-modal{position:absolute;inset:0;background:rgba(10,8,30,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto}
.dz-panel{background:linear-gradient(180deg,#2c3f7a,#1a2350);border:3px solid #2a0b5c;border-radius:22px;box-shadow:0 6px 0 #2a0b5c;padding:18px;width:min(88vw,360px);text-align:center}
.dz-panel h2{margin:0 0 6px;font-size:26px;color:#ffe14d;-webkit-text-stroke:1.5px #2a0b5c}
.dz-panel .row{display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.12);font-size:15px}
.dz-panel .row b{display:flex;align-items:center;gap:4px}
.dz-panel .acts{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.dz-big{font:inherit;font-weight:700;font-size:17px;border:3px solid #2a0b5c;border-radius:16px;padding:10px;cursor:pointer;color:#2a0b5c;background:linear-gradient(180deg,#ffe680,#ffb03a);box-shadow:0 4px 0 #2a0b5c;display:flex;align-items:center;justify-content:center;gap:6px}
.dz-big.alt{background:linear-gradient(180deg,#d8e4ff,#9fb3e8)}
.dz-big:disabled{opacity:.5}
@media (orientation:landscape) and (max-height:500px){.dz-pad{width:58px;height:58px}.dz-pad.jump{width:70px;height:70px}.dz-card{top:34%}}
`;

let cssDone = false;

export class Hud {
  g: DisasterGame;
  el: HTMLDivElement;
  private scn: HTMLElement;
  private phase: HTMLElement;
  private phaseLbl: HTMLElement;
  private phaseNum: HTMLElement;
  private alive: HTMLElement;
  private streak: HTMLElement;
  private card: HTMLElement;
  private toastEl: HTMLElement;
  private cardTimer = 0;
  private toastTimer = 0;
  private lastNum = -1;
  private lastAlive = '';

  constructor(g: DisasterGame) {
    this.g = g;
    if (!cssDone) {
      cssDone = true;
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'dz-hud';
    el.innerHTML = `
      <div class="dz-top">
        <button class="dz-btn dz-home" aria-label="${t('dz.exit', 'Sair')}">${icon('home', { size: 26 })}</button>
        <div class="dz-mid"><div class="dz-scn"></div><div class="dz-phase"><span class="lbl"></span><b></b></div></div>
        <div class="dz-alive"><div class="dz-chip a">${icon('user', { size: 18 })}<span></span></div><div class="dz-chip s">${icon('fire', { size: 18 })}<span></span></div></div>
      </div>
      <div class="dz-card"></div>
      <div class="dz-toast"></div>
      <div class="dz-ctrl">
        <div class="grp"><div class="dz-pad left">${icon('arrow-up')}</div><div class="dz-pad right">${icon('arrow-up')}</div></div>
        <div class="dz-pad jump">${icon('arrow-up')}</div>
      </div>`;
    g.root.appendChild(el);
    this.el = el;
    this.scn = el.querySelector('.dz-scn')!;
    this.phase = el.querySelector('.dz-phase')!;
    this.phaseLbl = el.querySelector('.dz-phase .lbl')!;
    this.phaseNum = el.querySelector('.dz-phase b')!;
    this.alive = el.querySelector('.dz-chip.a span')!;
    this.streak = el.querySelector('.dz-chip.s span')!;
    this.card = el.querySelector('.dz-card')!;
    this.toastEl = el.querySelector('.dz-toast')!;
    el.querySelector('.dz-home')!.addEventListener('click', () => {
      audio.click();
      g.requestExit();
    });
    const pad = (sel: string, k: 'l' | 'r' | 'j') => {
      const p = el.querySelector(sel) as HTMLElement;
      const ids = new Set<number>();
      const set = () => {
        g.touch[k] = ids.size > 0;
        p.classList.toggle('on', ids.size > 0);
      };
      p.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.unlock();
        ids.add(e.pointerId);
        try {
          p.setPointerCapture(e.pointerId);
        } catch {
          /* */
        }
        set();
      });
      const up = (e: PointerEvent) => {
        ids.delete(e.pointerId);
        set();
      };
      p.addEventListener('pointerup', up);
      p.addEventListener('pointercancel', up);
      p.addEventListener('lostpointercapture', up);
    };
    pad('.dz-pad.left', 'l');
    pad('.dz-pad.right', 'r');
    pad('.dz-pad.jump', 'j');
  }

  private showCard(html: string, dur: number, alert = false): void {
    this.card.innerHTML = html;
    this.card.classList.toggle('alert', alert);
    this.card.classList.add('on');
    this.cardTimer = dur;
  }

  roundCard(): void {
    const g = this.g;
    this.scn.textContent = g.scenarioTitle();
    const stars = '<span style="color:#ffe14d">' + '★'.repeat(g.sc.difficulty) + '</span>';
    this.showCard(
      `${dzIcon(g.finale ? 'bunker' : 'house', 64)}<div class="big">${t('dz.round', 'Cenário {n}', { n: g.sc.n })}</div><div class="sub">${g.sc.map.name()} &nbsp;${stars}</div>`,
      2.4,
    );
  }

  disasterCard(d: DisasterId): void {
    const info = DISASTERS[d];
    this.showCard(`${dzIcon(d, 72)}<div class="big">${info.name()}!</div><div class="sub">${info.hint()}</div>`, 2.8, true);
  }

  resultCard(survived: boolean, coins: number, alive: number): void {
    const g = this.g;
    if (survived && g.newBest) celebrateRecord(t('dz.recDetail', 'Sequência {n}', { n: g.streak }));
    if (survived)
      this.showCard(
        `${icon('trophy', { size: 72 })}<div class="big">${g.newBest ? t('dz.record', 'Novo recorde!') : t('dz.survived', 'Sobreviveu!')}</div><div class="sub">${icon('coin', { size: 18 })} +${fmt(coins)} &nbsp; ${icon('fire', { size: 18 })} ${t('dz.streak', 'Sequência {n}', { n: g.streak })}</div>`,
        3.8,
      );
    else
      this.showCard(
        `${dzIcon('ghost', 72)}<div class="big">${t('dz.lost', 'Quase!')}</div><div class="sub">${t('dz.lostsub', '{n} sobreviveram. Na próxima você consegue!', { n: alive })}</div>`,
        3.8,
      );
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    this.toastTimer = 2.4;
  }

  onPhase(): void {
    this.lastNum = -1;
    const p = this.g.phase;
    this.phase.classList.toggle('calm', p === 'prepare' || p === 'intro');
    this.phase.classList.toggle('safe', p === 'end');
    const g = this.g;
    const lbl =
      p === 'intro'
        ? t('dz.ph.intro', 'Prepare-se')
        : p === 'prepare'
          ? g.finale
            ? t('dz.ph.run', 'Corra ao bunker!')
            : g.sc.disasters[0] === 'tornado'
              ? t('dz.ph.house', 'Entre numa casa!')
              : g.sc.disasters[0] === 'terremoto' || g.sc.disasters[0] === 'meteoros' || g.sc.disasters[0] === 'raios'
                ? t('dz.ph.open', 'Fique no aberto!')
                : t('dz.ph.prepare', 'Suba em algum lugar!')
          : p === 'warn'
            ? t('dz.ph.warn', 'Alerta!')
            : p === 'disaster'
              ? t('dz.ph.survive', 'Sobreviva!')
              : p === 'impact'
                ? t('dz.ph.impact', 'Impacto!')
                : t('dz.ph.next', 'Próximo cenário');
    this.phaseLbl.textContent = lbl;
    // dica já no preparo, específica do desastre que vem (antes era genérica "suba": errado para tornado)
    if (p === 'prepare' && !g.finale) this.toast(DISASTERS[g.sc.disasters[0]].hint());
    if (p === 'prepare' && g.finale) this.toast(t('dz.tip.bunker', 'Siga para a direita e entre no bunker!'));
  }

  tick(dt = 1 / 60): void {
    const g = this.g;
    if (this.cardTimer > 0) {
      this.cardTimer -= dt;
      if (this.cardTimer <= 0) this.card.classList.remove('on');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('on');
    }
    const n = Math.max(0, Math.ceil(g.phaseDur - g.phaseT));
    if (n !== this.lastNum) {
      this.lastNum = n;
      this.phaseNum.textContent = String(n);
      if (n <= 3 && n > 0 && (g.phase === 'prepare' || g.phase === 'disaster')) audio.click();
    }
    let n2 = 0;
    for (const p of g.players) if (p.alive) n2++;
    const alive = n2 + '/' + g.players.length + '|' + g.streak;
    if (alive !== this.lastAlive) {
      this.lastAlive = alive;
      this.alive.textContent = n2 + '/' + g.players.length;
      this.streak.textContent = String(g.streak);
    }
  }

  summary(): void {
    const g = this.g;
    const m = document.createElement('div');
    m.className = 'dz-modal';
    const canDouble = g.sessionCoins > 0 && rewardedAvailable();
    m.innerHTML = `<div class="dz-panel">
      ${icon('trophy', { size: 64 })}
      <h2>${t('dz.sum.title', 'Resumo')}</h2>
      <div class="row"><span>${t('dz.sum.rounds', 'Rodadas')}</span><b>${fmt(g.sessionRounds)}</b></div>
      <div class="row"><span>${t('dz.sum.survived', 'Sobreviveu')}</span><b>${fmt(g.sessionSurvived)}</b></div>
      <div class="row"><span>${t('dz.sum.best', 'Melhor sequência')}</span><b>${icon('fire', { size: 16 })}${fmt(g.progress.best)}</b></div>
      <div class="row"><span>${t('dz.sum.coins', 'Moedas')}</span><b class="cn">${icon('coin', { size: 16 })}${fmt(g.sessionCoins)}</b></div>
      <div class="acts">
        ${canDouble ? `<button class="dz-big dbl">${icon('video', { size: 22 })}${t('dz.sum.double', 'Dobrar moedas')}</button>` : ''}
        <button class="dz-big alt cont">${icon('play', { size: 20 })}${t('dz.sum.continue', 'Continuar jogando')}</button>
        <button class="dz-big alt out">${icon('home', { size: 20 })}${t('dz.sum.exit', 'Voltar ao menu')}</button>
      </div></div>`;
    this.el.appendChild(m);
    const dbl = m.querySelector('.dbl') as HTMLButtonElement | null;
    dbl?.addEventListener('click', async () => {
      dbl.disabled = true;
      const ok = await showRewarded();
      if (ok) {
        addCoins(g.sessionCoins);
        audio.cash();
        (m.querySelector('.cn') as HTMLElement).innerHTML = `${icon('coin', { size: 16 })}${fmt(g.sessionCoins * 2)}`;
        g.sessionCoins = 0;
        dbl.remove();
      } else dbl.disabled = false;
    });
    m.querySelector('.cont')!.addEventListener('click', () => {
      audio.click();
      m.remove();
      g.resume();
    });
    m.querySelector('.out')!.addEventListener('click', () => {
      audio.click();
      g.finish();
    });
  }

  destroy(): void {
    this.el.remove();
  }
}
