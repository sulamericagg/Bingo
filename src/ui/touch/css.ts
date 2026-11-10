/** CSS dos controles de toque (injetado uma vez). */
const CSS = `
.tc-joy{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:30;opacity:0;transition:opacity .25s}
.tc-joy.on{opacity:1;transition:opacity .06s}
.tc-joy.idle{opacity:.38}
.tc-joy .tc-ring{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.10) 55%,rgba(255,255,255,.18));border:2px solid rgba(255,255,255,.42);box-shadow:0 0 0 1px rgba(0,0,0,.15)}
.tc-joy .tc-knob{position:absolute;border-radius:50%;background:rgba(255,255,255,.88);box-shadow:0 2px 6px rgba(0,0,0,.35),inset 0 0 0 2px rgba(42,11,92,.35);will-change:transform}
.tc-btn{touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:transform .07s ease-out,filter .07s;min-width:56px;min-height:56px}
.tc-btn.tc-pressed{transform:scale(.9);filter:brightness(1.12)}
`;
let done = false;
export function ensureTouchCss(): void {
  if (done || typeof document === 'undefined') return;
  done = true;
  const s = document.createElement('style');
  s.id = 'tc-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
