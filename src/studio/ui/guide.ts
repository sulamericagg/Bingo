/* ============================================================
 *  BLOOP STUDIO — "Monte um carro": primeira construção guiada em 5 passos.
 *  Um cartão pequeno no alto diz o que fazer, o botão certo pisca e
 *  "Fazer por mim" resolve o passo para quem travou. Confere o progresso
 *  olhando a criação (não depende de onde a criança tocou).
 * ============================================================ */
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { tap } from '../../core/haptics';
import type { Part } from '../format';
import type { Studio } from '../studio';
import { sicon } from './sicons';

interface Step {
  /** texto do passo */
  text: () => string;
  /** elementos que piscam (o primeiro que existir e estiver visível) */
  glow: () => string[];
  /** passo concluído? */
  done: () => boolean;
  /** "Fazer por mim" */
  auto: () => void;
  /** ao entrar no passo */
  enter?: () => void;
}

const DONE_KEY = 'bs-guide-car';

export function guideDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export class CarGuide {
  private el: HTMLElement;
  private i = 0;
  private timer = 0;
  private chassis = 0;
  private paint0 = -1;
  private driveFrom: { x: number; z: number } | null = null;
  private glowing: HTMLElement[] = [];
  private steps: Step[];
  active = false;

  constructor(private s: Studio) {
    this.el = document.createElement('div');
    this.el.className = 'bs-guide';
    this.el.hidden = true;
    this.el.setAttribute('data-touch-ignore', '');
    s.el.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-g]');
      if (!b) return;
      if (b.dataset.g === 'auto') this.steps[this.i]?.auto();
      else if (b.dataset.g === 'close') this.stop();
      this.tick();
    });
    const ed = () => s.editor;
    const box = (): Part | undefined => ed().part(this.chassis) ?? ed().doc.parts.find((p) => p.t === 'box' && !p.role);
    const selectChassis = () => {
      const b = box();
      if (b && !(ed().sel.size === 1 && ed().sel.has(b.id))) ed().select([b.id]);
    };
    this.steps = [
      {
        text: () => t('studio.guide.s1', 'Toque em Adicionar e escolha o Cubo: ele vai ser o corpo do carro.'),
        glow: () => (s.panels.current === 'add' ? ['.bs-cell[data-p=box]'] : ['.bs-tool[data-t=add]']),
        done: () => {
          const b = ed().doc.parts.find((p) => p.t === 'box' && !p.role);
          if (b) this.chassis = b.id;
          return !!b;
        },
        auto: () => {
          const id = ed().addPrim('box');
          if (id) this.chassis = id;
        },
      },
      {
        enter: () => {
          s.panels.closeAll();
          selectChassis();
        },
        text: () => t('studio.guide.s2', 'Deixe o cubo comprido: toque em Tamanho e arraste o quadradinho azul para esticar.'),
        glow: () => (ed().tool === 'scale' ? [] : ['.bs-tool[data-t=scale]']),
        done: () => {
          const sz = box()?.s ?? [1, 1, 1];
          return Math.max(sz[0], sz[2]) >= 1.4;
        },
        auto: () => {
          const b = box();
          if (!b) return;
          ed().change('scale', () => {
            b.s = [1.6, 0.6, 2.8];
            b.p = [b.p[0], 0.8, b.p[2]];
          });
          selectChassis();
        },
      },
      {
        enter: () => {
          selectChassis();
          this.paint0 = box()?.m ?? 0;
        },
        text: () => t('studio.guide.s3', 'Agora a cor! Toque em Pintar e escolha a que você mais gosta.'),
        glow: () => (s.panels.current === 'paint' ? ['.bs-sw[data-c]'] : ['.bs-tool[data-t=paint]']),
        done: () => (box()?.m ?? 0) !== this.paint0,
        auto: () => {
          const b = box();
          if (b) ed().setMaterial([b.id], { c: '#ff5cc8', k: 'plastic' });
        },
      },
      {
        enter: () => {
          s.panels.closeAll();
          selectChassis();
        },
        text: () => t('studio.guide.s4', 'Hora das rodas: toque em Mecânica e aperte “Kit carro”.'),
        glow: () => (s.panels.current === 'mech' ? ['.bs-panel .bs-kit'] : ['.bs-tool[data-t=mech]']),
        done: () => {
          const ps = ed().doc.parts;
          return ps.filter((p) => p.role === 'wheel').length >= 2 && ps.some((p) => p.role === 'seat');
        },
        auto: () => {
          selectChassis();
          s.panels.wheelKit();
        },
      },
      {
        enter: () => {
          s.panels.closeAll();
          ed().clearSelection();
          this.driveFrom = null;
        },
        text: () =>
          s.mode === 'play'
            ? t('studio.guide.s5b', 'Use o joystick para acelerar e virar. Vai!')
            : t('studio.guide.s5', 'Pronto para dirigir? Aperte Testar!'),
        glow: () => (s.mode === 'play' ? [] : ['.bs-test']),
        done: () => {
          const st = s.play?.status();
          if (!st?.driving) return false;
          if (!this.driveFrom) this.driveFrom = { x: st.x, z: st.z };
          return Math.hypot(st.x - this.driveFrom.x, st.z - this.driveFrom.z) > 8;
        },
        auto: () => {
          if (s.mode !== 'play') void s.startPlay();
        },
      },
    ];
  }

  /** começa do zero num veículo novo */
  start(): void {
    this.s.panels.closeAll();
    this.s.newDoc('vehicle');
    this.s.editor.grid = 0.5;
    this.i = 0;
    this.chassis = 0;
    this.active = true;
    this.el.hidden = false;
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  stop(): void {
    this.active = false;
    clearInterval(this.timer);
    this.el.hidden = true;
    this.setGlow([]);
  }

  private tick(): void {
    if (!this.active) return;
    const st = this.steps[this.i];
    if (st.done()) {
      tap('light');
      this.i++;
      if (this.i >= this.steps.length) return this.finish();
      this.steps[this.i].enter?.();
      this.render();
      return;
    }
    this.render();
  }

  private finish(): void {
    this.stop();
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* */
    }
    notify(t('studio.guide.done', 'Você montou e dirigiu seu carro! Agora invente o seu.'), { icon: 'trophy', kind: 'good', key: 'guide' });
  }

  private render(): void {
    const st = this.steps[this.i];
    if (!st) return;
    const dots = this.steps.map((_, k) => `<i class="${k < this.i ? 'ok' : k === this.i ? 'on' : ''}"></i>`).join('');
    const html = `<div class="bs-gtop"><b>${t('studio.guide.title', 'Monte um carro')}</b><span class="bs-gdots">${dots}</span>
      <button class="bs-gx" data-g="close" aria-label="${t('studio.close', 'Fechar')}">${sicon('close', 14)}</button></div>
      <p><em>${this.i + 1}/${this.steps.length}</em> ${st.text()}</p>
      <button class="bs-gauto" data-g="auto">${t('studio.guide.auto', 'Fazer por mim')}</button>`;
    if (this.el.dataset.h !== html) {
      this.el.innerHTML = html;
      this.el.dataset.h = html;
    }
    this.el.classList.toggle('play', this.s.mode === 'play');
    const els: HTMLElement[] = [];
    for (const sel of st.glow()) {
      const e = this.s.el.querySelector<HTMLElement>(sel);
      if (e && e.offsetParent) els.push(e);
    }
    this.setGlow(els);
  }

  private setGlow(els: HTMLElement[]): void {
    for (const e of this.glowing) if (!els.includes(e)) e.classList.remove('bs-glow');
    for (const e of els) e.classList.add('bs-glow');
    this.glowing = els;
  }

  dispose(): void {
    this.stop();
    this.el.remove();
  }
}
