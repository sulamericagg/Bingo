/**
 * Seção "Controles" do Ajustes + chave "Jogar sozinho" (componente único para todos os jogos).
 */
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { joyRadius } from './joystick';
import { CONTROL_DEFAULTS, controls, hapticsOn, isSolo, onControlsChange, setControl, setHaptics, setSolo, type ControlPrefs, type JoyMode, type JoySize } from './settings';

const CSS = `
.tcs{display:flex;flex-direction:column;gap:8px;margin:6px 0}
.tcs h3{margin:6px 0 0;font-size:15px;letter-spacing:.5px;opacity:.85;text-transform:uppercase}
.tcs-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}
.tcs-row>span{font-weight:600;text-align:left;flex:1;min-width:0}
.tcs-seg{display:flex;border-radius:12px;overflow:hidden;border:2px solid rgba(255,255,255,.2);flex:none}
.tcs-seg button{font:inherit;font-weight:700;font-size:13px;border:0;background:transparent;color:inherit;padding:8px 10px;min-width:44px;min-height:40px;cursor:pointer;touch-action:manipulation}
.tcs-seg button.on{background:#5ef0ff;color:#1a0b3d}
.tcs-sw{position:relative;width:52px;height:30px;flex:none}
.tcs-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.tcs-sw i{position:absolute;inset:0;border-radius:99px;background:rgba(255,255,255,.2);transition:background .15s;pointer-events:none}
.tcs-sw i::after{content:'';position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .15s}
.tcs-sw input:checked+i{background:#4fd67a}
.tcs-sw input:checked+i::after{transform:translateX(22px)}
.tcs-row.col{flex-direction:column;align-items:stretch;gap:6px}
.tcs-seg button{min-width:64px;min-height:44px;font-size:14px}
.tcs-slider{display:flex;align-items:center;gap:10px}
.tcs-slider input{flex:1;height:32px;accent-color:#5ef0ff}
.tcs-slider b{min-width:48px;text-align:right}
.tcs-pos{display:flex;flex-direction:column;align-items:center;gap:4px}
.tcs-pos-box{position:relative;width:min(100%,150px);border-radius:16px;border:2px solid rgba(255,255,255,.3);background:linear-gradient(180deg,rgba(94,240,255,.10),rgba(255,255,255,.04));touch-action:none;cursor:grab;overflow:hidden}
.tcs-pos-box.drag{cursor:grabbing;border-color:#5ef0ff}
.tcs-pos-joy,.tcs-pos-btn{position:absolute;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none}
.tcs-pos-joy{border:2px dashed rgba(255,255,255,.75);background:rgba(255,255,255,.14)}
.tcs-pos-joy.fixed{border-style:solid}
.tcs-pos-joy b{position:absolute;left:50%;top:50%;width:46%;height:46%;transform:translate(-50%,-50%);border-radius:50%;background:rgba(255,255,255,.9)}
.tcs-pos-btn{top:82%;width:16%;aspect-ratio:1;background:rgba(255,176,58,.6)}
.tcs-pos small{opacity:.8;font-size:12px;text-align:center}
.tcs-reset{font:inherit;font-weight:700;font-size:13px;align-self:center;border:2px solid rgba(255,255,255,.25);background:transparent;color:inherit;border-radius:12px;padding:8px 14px;min-height:40px;cursor:pointer}
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

/** Prévia arrastável: "Arraste o analógico para onde for confortável". */
function posPreview(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tcs-pos';
  const box = document.createElement('div');
  box.className = 'tcs-pos-box';
  box.dataset.touchIgnore = '';
  const W = window.innerWidth || 400,
    H = window.innerHeight || 800;
  box.style.aspectRatio = `${W} / ${H}`;
  // em retrato a prévia ficava com ~330 px de altura (metade do painel): limita a ~200 px
  box.style.width = `min(100%, ${Math.round(Math.min(150, (200 * W) / H))}px)`;
  box.innerHTML = '<i class="tcs-pos-joy"><b></b></i><i class="tcs-pos-btn"></i>';
  const joy = box.querySelector('.tcs-pos-joy') as HTMLElement;
  const btn = box.querySelector('.tcs-pos-btn') as HTMLElement;
  const hint = document.createElement('small');
  hint.textContent = t('controls.posHint', 'Arraste o analógico para onde for confortável');
  const draw = () => {
    const p = controls.joyPos;
    const R = (joyRadius() / Math.min(W, H)) * 100; // % do lado menor
    const left = controls.lefty ? 1 - p.x : p.x;
    joy.style.left = left * 100 + '%';
    joy.style.top = p.y * 100 + '%';
    joy.style.width = `${R * 2 * (Math.min(W, H) / W)}%`;
    joy.style.aspectRatio = '1';
    btn.style.left = (controls.lefty ? 0.14 : 0.86) * 100 + '%';
    btn.classList.toggle('fixed', controls.joyMode === 'fixed');
    joy.classList.toggle('fixed', controls.joyMode === 'fixed');
  };
  let pid = -1;
  const set = (e: PointerEvent) => {
    const r = box.getBoundingClientRect();
    let fx = (e.clientX - r.left) / r.width;
    if (controls.lefty) fx = 1 - fx;
    const x = Math.max(0.06, Math.min(0.48, fx));
    const y = Math.max(0.4, Math.min(0.94, (e.clientY - r.top) / r.height));
    setControl('joyPos', { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    draw();
  };
  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pid = e.pointerId;
    try {
      box.setPointerCapture(pid);
    } catch {
      /* */
    }
    box.classList.add('drag');
    tap('light');
    set(e);
  });
  box.addEventListener('pointermove', (e) => e.pointerId === pid && set(e));
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    pid = -1;
    box.classList.remove('drag');
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  box.addEventListener('lostpointercapture', up);
  wrap.append(box, hint);
  draw();
  const off = onControlsChange(() => (wrap.isConnected ? draw() : off()));
  return wrap;
}

function slider(val: number, min: number, max: number, step: number, set: (v: number) => void, fmt: (v: number) => string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'tcs-slider';
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = String(min);
  inp.max = String(max);
  inp.step = String(step);
  inp.value = String(val);
  const out = document.createElement('b');
  out.textContent = fmt(val);
  inp.oninput = () => {
    out.textContent = fmt(+inp.value);
    set(+inp.value);
  };
  inp.onchange = () => tap('light');
  box.append(inp, out);
  return box;
}

/** Renderiza a seção "Controles" dentro de `host` (substitui o conteúdo). */
export function renderControlsSettings(host: HTMLElement): void {
  css();
  host.innerHTML = '';
  host.classList.add('tcs');
  const h = document.createElement('h3');
  h.textContent = t('controls.title', 'Controles');
  const sens = row(
    t('controls.sens', 'Sensibilidade da câmera'),
    slider(controls.lookSens, 0.4, 2.5, 0.05, (v) => setControl('lookSens', v), (v) => Math.round(v * 100) + '%'),
  );
  sens.classList.add('col');
  const pos = row(t('controls.pos', 'Posição do analógico'), posPreview());
  pos.classList.add('col');
  host.append(
    h,
    row(
      t('controls.joyMode', 'Analógico'),
      seg<JoyMode>(controls.joyMode, [['float', t('controls.float', 'Flutuante')], ['fixed', t('controls.fixed', 'Fixo')]], (v) => setControl('joyMode', v)),
    ),
    row(
      t('controls.joySize', 'Tamanho do joystick'),
      seg<JoySize>(controls.joySize, [['S', t('controls.small', 'P')], ['M', t('controls.medium', 'M')], ['L', t('controls.large', 'G')]], (v) => setControl('joySize', v)),
    ),
    pos,
    sens,
    row(t('controls.lefty', 'Modo canhoto (trocar lados)'), sw(controls.lefty, (v) => setControl('lefty', v))),
    row(t('controls.invertY', 'Inverter vertical'), sw(controls.invertY, (v) => setControl('invertY', v))),
    row(t('controls.gyro', 'Mirar com giroscópio'), sw(controls.gyro, (v) => setControl('gyro', v))),
    row(t('settings.haptics', 'Vibração'), sw(hapticsOn(), (v) => setHaptics(v))),
  );
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'tcs-reset';
  reset.textContent = t('controls.reset', 'Restaurar padrão');
  reset.onclick = () => {
    tap('light');
    (Object.keys(CONTROL_DEFAULTS) as (keyof ControlPrefs)[]).forEach((k) => {
      const v = CONTROL_DEFAULTS[k];
      setControl(k, (typeof v === 'object' ? { ...v } : v) as never);
    });
    renderControlsSettings(host);
  };
  host.append(reset);
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
