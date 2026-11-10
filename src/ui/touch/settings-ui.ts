/**
 * Seção "Controles" do Ajustes + chave "Jogar sozinho" (componente único para todos os jogos).
 */
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { controls, hapticsOn, isSolo, setControl, setHaptics, setSolo, type JoySize, type Sens } from './settings';

const CSS = `
.tcs{display:flex;flex-direction:column;gap:8px;margin:6px 0}
.tcs h3{margin:6px 0 0;font-size:15px;letter-spacing:.5px;opacity:.85;text-transform:uppercase}
.tcs-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}
.tcs-row>span{font-weight:600}
.tcs-seg{display:flex;border-radius:12px;overflow:hidden;border:2px solid rgba(255,255,255,.2);flex:none}
.tcs-seg button{font:inherit;font-weight:700;font-size:13px;border:0;background:transparent;color:inherit;padding:8px 10px;min-width:44px;min-height:40px;cursor:pointer;touch-action:manipulation}
.tcs-seg button.on{background:#5ef0ff;color:#1a0b3d}
.tcs-sw{position:relative;width:52px;height:30px;flex:none}
.tcs-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.tcs-sw i{position:absolute;inset:0;border-radius:99px;background:rgba(255,255,255,.2);transition:background .15s;pointer-events:none}
.tcs-sw i::after{content:'';position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .15s}
.tcs-sw input:checked+i{background:#4fd67a}
.tcs-sw input:checked+i::after{transform:translateX(22px)}
.tc-solo{display:inline-flex;align-items:center;gap:10px;padding:6px 12px 6px 14px;border-radius:999px;background:rgba(20,8,50,.72);color:#fff;font:700 14px var(--font,'Fredoka',system-ui,sans-serif);border:2px solid rgba(255,255,255,.22);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;min-height:44px;box-sizing:border-box}
.tc-solo small{display:block;font-weight:500;font-size:11px;opacity:.75}
`;
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function seg<T extends string>(cur: T, opts: [T, string][], set: (v: T) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'tcs-seg';
  for (const [v, label] of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.classList.toggle('on', v === cur);
    b.onclick = () => {
      set(v);
      tap('light');
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    };
    box.appendChild(b);
  }
  return box;
}
function sw(on: boolean, set: (v: boolean) => void): HTMLElement {
  const l = document.createElement('label');
  l.className = 'tcs-sw';
  l.innerHTML = '<input type="checkbox"><i></i>';
  const inp = l.querySelector('input')!;
  inp.checked = on;
  inp.onchange = () => {
    set(inp.checked);
    tap('light');
  };
  return l;
}
function row(label: string, ctl: HTMLElement): HTMLElement {
  const r = document.createElement('div');
  r.className = 'tcs-row';
  const s = document.createElement('span');
  s.textContent = label;
  r.append(s, ctl);
  return r;
}

/** Renderiza a seção "Controles" dentro de `host` (substitui o conteúdo). */
export function renderControlsSettings(host: HTMLElement): void {
  css();
  host.innerHTML = '';
  host.classList.add('tcs');
  const h = document.createElement('h3');
  h.textContent = t('controls.title', 'Controles');
  host.append(
    h,
    row(
      t('controls.sens', 'Sensibilidade da câmera'),
      seg<Sens>(controls.sens, [['low', t('controls.low', 'Baixa')], ['mid', t('controls.mid', 'Média')], ['high', t('controls.high', 'Alta')]], (v) => setControl('sens', v)),
    ),
    row(t('controls.invertY', 'Inverter vertical'), sw(controls.invertY, (v) => setControl('invertY', v))),
    row(
      t('controls.joySize', 'Tamanho do joystick'),
      seg<JoySize>(controls.joySize, [['S', t('controls.small', 'P')], ['M', t('controls.medium', 'M')], ['L', t('controls.large', 'G')]], (v) => setControl('joySize', v)),
    ),
    row(t('controls.lefty', 'Modo canhoto (trocar lados)'), sw(controls.lefty, (v) => setControl('lefty', v))),
    row(t('controls.gyro', 'Mirar com giroscópio'), sw(controls.gyro, (v) => setControl('gyro', v))),
    row(t('controls.haptics', 'Vibração'), sw(hapticsOn(), (v) => setHaptics(v))),
  );
}

/**
 * Chave "Jogar sozinho" (sem bots), lembrada por jogo. Coloque na tela inicial do jogo.
 * `onChange` é chamado na hora em que o jogador muda.
 */
export function soloToggle(game: string, onChange?: (solo: boolean) => void, sub?: string): HTMLLabelElement {
  css();
  const l = document.createElement('label');
  l.className = 'tc-solo';
  l.dataset.touchIgnore = '';
  l.innerHTML = '<span><b></b><small></small></span><span class="tcs-sw"><input type="checkbox"><i></i></span>';
  l.querySelector('b')!.textContent = t('solo.label', 'Jogar sozinho');
  l.querySelector('small')!.textContent = sub ?? t('solo.sub', 'sem bots');
  const inp = l.querySelector('input')!;
  inp.checked = isSolo(game);
  inp.onchange = () => {
    setSolo(game, inp.checked);
    tap('light');
    onChange?.(inp.checked);
  };
  ['pointerdown', 'click', 'touchstart'].forEach((ev) => l.addEventListener(ev, (e) => e.stopPropagation()));
  return l;
}
