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
import { dzIcon, type DzIcon } from './icons';
import { bigMoment, clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { controls, createJoystick, onControlsChange, soloToggle, type Joystick } from '../../ui/touch';

const CSS = `
.dz-root{position:fixed;inset:0;overflow:hidden;background:#0e1a33;touch-action:none;user-select:none;-webkit-user-select:none;font-family:'Fredoka',system-ui,sans-serif;color:#fff}
.dz-canvas{position:absolute;inset:0;display:block}
.dz-hud{position:absolute;inset:0;pointer-events:none}
.dz-top{position:absolute;left:0;right:0;top:0;padding:max(10px,env(safe-area-inset-top)) var(--edge-r,10px) 0 var(--edge-l,10px);display:flex;align-items:flex-start;gap:8px}
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
.dz-ctrl{position:absolute;left:0;right:0;bottom:0;padding:0 var(--edge-r,14px) max(var(--edge-b,14px),calc(var(--safe-bot,0px) + 10px)) var(--edge-l,14px);display:flex;justify-content:flex-end;align-items:flex-end;pointer-events:none}
.dz-ctrl.lefty{justify-content:flex-start}
.dz-solo{display:flex;justify-content:center;margin:4px 0 2px}
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
.dz-warn{position:absolute;left:50%;top:calc(var(--nt-top,64px) + env(safe-area-inset-top,0px) + 40px);transform:translate(-50%,-6px) scale(.9);display:flex;align-items:center;gap:10px;padding:6px 16px 6px 10px;border-radius:22px;background:rgba(160,20,40,.78);border:3px solid #2a0b5c;box-shadow:0 4px 0 #2a0b5c;pointer-events:none;opacity:0;transition:opacity .15s,transform .15s}
.dz-warn.on{opacity:1;transform:translate(-50%,0) scale(1)}
.dz-warn.combo{background:linear-gradient(90deg,rgba(255,90,60,.9),rgba(160,20,140,.9))}
.dz-warn .cb{font-weight:800;font-size:18px;color:#fff;-webkit-text-stroke:1px #2a0b5c;white-space:nowrap}
.dz-chip.c{background:rgba(120,80,0,.72)}
.dz-warn .ico{width:54px;height:54px;animation:dzwob .5s ease-in-out infinite alternate}
.dz-warn b{font-size:46px;line-height:1;color:#ffe14d;-webkit-text-stroke:2px #2a0b5c;min-width:.7em;text-align:center}
.dz-warn .safe{display:flex;align-items:center;opacity:.95}.dz-warn .safe .ico{width:34px;height:34px;animation:none}
@keyframes dzwob{from{transform:rotate(-8deg) scale(.95)}to{transform:rotate(8deg) scale(1.08)}}
.dz-edge{position:absolute;pointer-events:none;opacity:0;transition:opacity .15s;display:flex;gap:2px;filter:drop-shadow(0 3px 0 #2a0b5c)}
.dz-edge.on{opacity:1;animation:dzpulse .45s ease-in-out infinite alternate}
.dz-edge .ico{width:44px;height:44px;filter:hue-rotate(-125deg) saturate(1.6)}
.dz-edge.l{left:calc(var(--edge-l,6px) + 2px);top:42%}.dz-edge.l .ico{transform:rotate(90deg)}
.dz-edge.r{right:calc(var(--edge-r,6px) + 2px);top:42%}.dz-edge.r .ico{transform:rotate(-90deg)}
.dz-edge.t{left:50%;top:28%;margin-left:-66px}.dz-edge.t .ico{transform:rotate(180deg)}
.dz-edge.b{left:50%;bottom:calc(var(--edge-b,14px) + 110px);margin-left:-66px}
@keyframes dzpulse{from{transform:scale(.92)}to{transform:scale(1.1)}}
@media (orientation:landscape) and (max-height:500px){.dz-warn{top:calc(var(--nt-top,56px) + 34px);padding:3px 12px 3px 8px}.dz-warn .ico{width:40px;height:40px}.dz-warn b{font-size:34px}.dz-pad{width:58px;height:58px}.dz-pad.jump{width:70px;height:70px}}
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
  private held: HTMLElement;
  private lastHeld = -1;
  /** joystick flutuante (andar/subir escada) — src/ui/touch */
  joy: Joystick;
  private offCtl: () => void;
  private lastNum = -1;
  /** aviso visual (ícone + contagem + seta de onde vem) — sem depender de leitura */
  private warnEl!: HTMLElement;
  private warnNum!: HTMLElement;
  private edgeEl!: HTMLElement;
  private warnKey = '';
  private warnN = -1;
  /** dedos no botão pular */
  private jumpIds = new Set<number>();
  private syncJump: () => void = () => {};
  private offWin: () => void = () => {};
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
        <div class="dz-alive"><div class="dz-chip a">${icon('user', { size: 18 })}<span></span></div><div class="dz-chip s">${icon('fire', { size: 18 })}<span></span></div><div class="dz-chip c" hidden>${icon('coin', { size: 18 })}<span></span></div></div>
      </div>
      <div class="dz-warn" aria-hidden="true"><span class="di"></span><b></b><span class="safe"></span></div>
      <div class="dz-edge" aria-hidden="true">${icon('arrow-up')}${icon('arrow-up')}${icon('arrow-up')}</div>
      <div class="dz-ctrl">
        <div class="dz-pad jump" data-touch-ignore>${icon('arrow-up')}</div>
      </div>`;
    g.root.appendChild(el);
    this.el = el;
    this.scn = el.querySelector('.dz-scn')!;
    this.phase = el.querySelector('.dz-phase')!;
    this.phaseLbl = el.querySelector('.dz-phase .lbl')!;
    this.phaseNum = el.querySelector('.dz-phase b')!;
    this.alive = el.querySelector('.dz-chip.a span')!;
    this.streak = el.querySelector('.dz-chip.s span')!;
    this.held = el.querySelector('.dz-chip.c')!;
    this.warnEl = el.querySelector('.dz-warn')!;
    this.warnNum = el.querySelector('.dz-warn b')!;
    this.edgeEl = el.querySelector('.dz-edge')!;
    // joystick flutuante na metade esquerda (direita no modo canhoto); pular fica do outro lado
    this.joy = createJoystick(g.root, { zoneTop: 0.18, deadZone: 0.18, mouse: false });
    const ctl = el.querySelector('.dz-ctrl') as HTMLElement;
    const side = () => ctl.classList.toggle('lefty', controls.lefty);
    side();
    this.offCtl = onControlsChange(side);
    // avisos logo abaixo da barra do topo
    requestAnimationFrame(() => {
      const top = el.querySelector('.dz-top') as HTMLElement | null;
      if (!top || !top.isConnected) return;
      const pad = parseFloat(getComputedStyle(top).paddingTop) || 10;
      setNotifyTop(top.getBoundingClientRect().bottom - pad + 16);
    });
    el.querySelector('.dz-home')!.addEventListener('click', () => {
      audio.click();
      g.requestExit();
    });
    // Botão PULAR (multitoque com o joystick). Cada dedo que encosta é um pulo novo (borda), mesmo
    // que o "soltar" de um dedo anterior tenha se perdido; o estado "segurando" (pulo mais alto,
    // subir escada) vem do conjunto de dedos e é limpo por qualquer pointerup/cancel na janela,
    // por pausa, perda de foco e app em segundo plano — nada de pulo preso.
    const jp = el.querySelector('.dz-pad.jump') as HTMLElement;
    jp.dataset.dzJump = '';
    const ids = this.jumpIds;
    const sync = () => {
      g.touch.j = ids.size > 0;
      jp.classList.toggle('on', ids.size > 0);
    };
    this.syncJump = sync;
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      audio.unlock();
      ids.add(e.pointerId);
      g.jumpTap = true;
      try {
        jp.setPointerCapture(e.pointerId);
      } catch {
        /* dedo já saiu */
      }
      sync();
    };
    const up = (e: PointerEvent) => {
      if (ids.delete(e.pointerId)) sync();
    };
    jp.addEventListener('pointerdown', down);
    jp.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) jp.addEventListener(ev, up);
    // o soltar pode chegar em outro elemento (captura perdida): ouve na janela também
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    this.offWin = () => {
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }

  roundCard(): void {
    const g = this.g;
    this.scn.textContent = (g.training ? t('dz.train', 'Treino') + ' · ' : '') + g.scenarioTitle();
    // faixa curta no topo (antes: cartão grande no meio da tela)
    bigMoment(t('dz.round', 'Cenário {n}', { n: g.sc.n }), { sub: g.sc.map.name() + ' ' + '★'.repeat(g.sc.difficulty), ms: 1200 });
  }

  /** antes de cada desastre o aviso é UM cartão só (ícone + contagem + seta: warnTick); o meteoro final
   *  (sem fase de alerta) ainda ganha a faixa grande */
  disasterCard(d: DisasterId): void {
    if (d !== 'meteoro') return;
    const info = DISASTERS[d];
    bigMoment(info.name() + '!', { icon: 'warning', color: 'linear-gradient(90deg,#ff5a3c,#c8193c)', ms: 1200 });
  }

  resultCard(survived: boolean, coins: number, alive: number): void {
    const g = this.g;
    if (survived && g.newBest) celebrateRecord(t('dz.recDetail', 'Sequência {n}', { n: g.streak }));
    if (survived) {
      bigMoment(g.newBest ? t('dz.record', 'Novo recorde!') : t('dz.survived', 'Sobreviveu!'), { icon: 'trophy', sub: '+' + fmt(coins), ms: 1200 });
      notify(t('dz.streak', 'Sequência {n}', { n: g.streak }), { icon: 'fire', kind: 'good' });
    } else {
      bigMoment(t('dz.lost', 'Quase!'), { color: 'linear-gradient(90deg,#5b6bb0,#2c3f7a)', ms: 1100 });
      notify(g.training ? t('dz.train.lost', 'Tudo bem, é treino! Fique perto da seta verde.') : g.players.length > 1 ? t('dz.lostsub', '{n} sobreviveram. Na próxima você consegue!', { n: alive }) : t('dz.lostsolo', 'Na próxima você consegue!'), { ms: 3000 });
    }
  }

  /** aviso compacto no topo (src/ui/notify) */
  private lastToast = '';
  private lastToastAt = 0;
  toast(msg: string, key = 'dz-hint'): void {
    // a mesma frase repetida virava "×14", "×26": só renova depois de 6 s
    const now = performance.now();
    if (msg === this.lastToast && now - this.lastToastAt < 6000) return;
    this.lastToast = msg;
    this.lastToastAt = now;
    notify(msg, { key, ms: 3000 });
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
    // a dica do desastre aparece UMA vez, na pílula de objetivo (antes também saía igual num toast)
    if (p === 'prepare' && !g.finale && g.training) this.toast(t('dz.train.tip', 'Treino! Siga a seta verde até o lugar seguro.'));
    // objetivo atual num chip minúsculo no canto (fica até a rodada acabar)
    if (p === 'prepare') objective(g.finale ? t('dz.tip.bunker', 'Siga para a direita e entre no bunker!') : DISASTERS[g.sc.disasters[0]].hint(), { icon: 'warning' });
    else if (p === 'end' || p === 'intro') objective(null);
  }

  /** alerta antes de cada desastre: ícone grande, contagem até começar e seta do lado de onde vem */
  private warnTick(): void {
    const g = this.g;
    // aviso no meio do desastre (onda, tremor, rajada, desastre duplo): o mesmo cartão
    const mid = g.phase === 'disaster' && g.alertT > 0;
    const left = mid ? g.alertT : g.phase === 'warn' ? g.phaseDur - g.phaseT : g.phase === 'prepare' && !g.finale ? g.phaseDur - g.phaseT + 2.6 : 99;
    const show = left <= 5.6 && left > 0;
    const d = g.sc.disasters[Math.min(g.dIndex, g.sc.disasters.length - 1)];
    const ic: DzIcon = mid ? g.alertIcon : d;
    const from = show ? (mid ? g.alertFrom : g.hazardFrom(d)) : 0;
    const key = show ? ic + from : '';
    if (key !== this.warnKey) {
      this.warnKey = key;
      this.warnEl.classList.toggle('on', show);
      // o chip de fase (com a outra contagem) some enquanto o cartão de alerta está na tela
      this.phase.style.visibility = show ? 'hidden' : '';
      this.edgeEl.className = 'dz-edge' + (show ? ' on ' + (from === -1 ? 'l' : from === 1 ? 'r' : from === 2 ? 't' : 'b') : '');
      if (show) {
        (this.warnEl.querySelector('.di') as HTMLElement).innerHTML = dzIcon(ic, 54);
        this.warnEl.classList.toggle('combo', ic === 'combo');
        // dica sem texto: casa (tornado), seta para cima (água/lava/neve), céu aberto = nada
        const safe = ic === 'combo' ? `<span class="cb">${t('dz.combo', 'Desastre duplo!')}</span>` : ic === 'tornado' || ic === 'areia' ? dzIcon('house', 34) : ic === 'terremoto' || ic === 'sumidouro' ? '' : from === 3 || from === -1 || from === 1 ? icon('arrow-up', { size: 34 }) : '';
        (this.warnEl.querySelector('.safe') as HTMLElement).innerHTML = safe;
      }
    }
    const n = show ? Math.ceil(left) : -1;
    if (n !== this.warnN) {
      this.warnN = n;
      this.warnNum.textContent = n > 0 ? String(n) : '';
    }
  }

  tick(_dt = 1 / 60): void {
    const g = this.g;
    this.warnTick();
    const n = Math.max(0, Math.ceil(g.phaseDur - g.phaseT));
    if (n !== this.lastNum) {
      this.lastNum = n;
      this.phaseNum.textContent = String(n);
      if (n <= 3 && n > 0 && (g.phase === 'prepare' || g.phase === 'disaster')) audio.click();
    }
    if (g.held !== this.lastHeld) {
      this.lastHeld = g.held;
      this.held.hidden = g.held <= 0;
      (this.held.lastElementChild as HTMLElement).textContent = String(g.held);
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
    if (this.modalOpen()) return;
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
      <div class="dz-solo"></div>
      <div class="acts">
        ${canDouble ? `<button class="dz-big dbl">${icon('video', { size: 22 })}${t('dz.sum.double', 'Dobrar moedas')}</button>` : ''}
        <button class="dz-big alt cont">${icon('play', { size: 20 })}${t('dz.sum.continue', 'Continuar jogando')}</button>
        <button class="dz-big alt out">${icon('home', { size: 20 })}${t('dz.sum.exit', 'Voltar ao menu')}</button>
      </div></div>`;
    m.dataset.touchIgnore = '';
    m.querySelector('.dz-solo')!.appendChild(
      soloToggle('disaster', () => notify(t('solo.next', 'Vale a partir da próxima rodada'), { key: 'solo' }), t('dz.solo.sub', 'sem bots na cidade')),
    );
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

  /** resumo da sessão aberto (o jogo fica pausado embaixo) */
  modalOpen(): boolean {
    return !!this.el.querySelector('.dz-modal');
  }

  /** solta o botão pular (pausa, foco perdido, toque cancelado) */
  releaseJump(): void {
    this.jumpIds.clear();
    this.syncJump();
  }

  destroy(): void {
    this.offWin();
    this.joy.destroy();
    this.offCtl();
    clearNotify();
    resetNotifyTop();
    this.el.remove();
  }
}
