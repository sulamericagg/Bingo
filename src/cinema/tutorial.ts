/* ============================================================
 *  BLOOP CINEMA — tutorial guiado da 1ª vez: um passo por vez,
 *  em avisos pequenos no canto (src/ui/notify). Avança quando a
 *  pessoa FAZ a ação; repete o aviso de vez em quando se travar.
 * ============================================================ */
import { t } from '../i18n';
import { notify } from '../ui/notify';

export type TutEvent = 'select' | 'expr' | 'line' | 'play' | 'shot' | 'export';
const STEPS: { ev: TutEvent; text: () => string }[] = [
  { ev: 'select', text: () => t('cin.tut.1', 'Toque num personagem na tela para escolher.') },
  { ev: 'expr', text: () => t('cin.tut.2', 'Agora escolha uma expressão para ele.') },
  { ev: 'line', text: () => t('cin.tut.3', 'Na aba Falas, escreva algo engraçado!') },
  { ev: 'play', text: () => t('cin.tut.4', 'Aperte ▶ para assistir sua cena.') },
  { ev: 'shot', text: () => t('cin.tut.5', 'Crie um novo plano no + da faixa de planos.') },
  { ev: 'export', text: () => t('cin.tut.6', 'Ficou bom? Toque em Exportar para salvar o vídeo!') },
];
const KEY = 'cin-tut';

let step = -1;
const done = new Set<TutEvent>();
let timer = 0;
let shown = 0;
let hide: (() => void) | null = null;

function read(): number {
  try {
    return parseInt(localStorage.getItem(KEY) ?? '0', 10) || 0;
  } catch {
    return STEPS.length;
  }
}
function write(n: number): void {
  try {
    localStorage.setItem(KEY, String(n));
  } catch {
    /* */
  }
}

function show(): void {
  while (step >= 0 && step < STEPS.length && done.has(STEPS[step].ev)) step++;
  if (step < 0 || step >= STEPS.length) return;
  hide?.();
  hide = notify(`${step + 1}/${STEPS.length} · ${STEPS[step].text()}`, { icon: 'hand-tap', ms: 4500, key: `cin-tut-${step}-${shown}` });
  shown++;
  clearTimeout(timer);
  if (shown < 4) timer = window.setTimeout(show, 11000);
}

/** Começa (ou continua) o tutorial se ainda não terminou. */
export function startTutorial(): void {
  step = read();
  if (step >= STEPS.length) return;
  shown = 0;
  timer = window.setTimeout(show, 900);
}

export function tutEvent(ev: TutEvent): void {
  if (step < 0 || step >= STEPS.length) return;
  done.add(ev);
  if (STEPS[step].ev !== ev) return;
  // pula passos que a pessoa já fez sozinha
  while (step < STEPS.length && done.has(STEPS[step].ev)) step++;
  write(step);
  shown = 0;
  hide?.();
  hide = null;
  clearTimeout(timer);
  if (step >= STEPS.length) {
    notify(t('cin.tut.done', 'Você é cineasta! Agora é só criar.'), { icon: 'trophy', kind: 'good' });
    return;
  }
  timer = window.setTimeout(show, 700);
}

export function stopTutorial(): void {
  clearTimeout(timer);
  hide?.();
  hide = null;
  step = -1;
}

export function resetTutorial(): void {
  write(0);
}
