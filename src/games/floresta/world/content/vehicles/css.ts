/* CSS da garagem e do painel de direção (injetado uma vez). */
const CSS = `
.mv-hud{position:absolute;inset:0;pointer-events:none;z-index:20;font-family:var(--font,'Fredoka',system-ui,sans-serif);color:#fff;user-select:none;-webkit-user-select:none}
.mv-hud .mv-b{pointer-events:auto;position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid rgba(255,255,255,.85);background:rgba(20,16,48,.55);display:flex;align-items:center;justify-content:center;padding:13px;box-sizing:border-box;color:#fff;backdrop-filter:blur(2px)}
.mv-hud .mv-b.on{background:rgba(255,211,74,.85);color:#2a1a00;border-color:#fff}
.mv-hud .mv-b.big{width:88px;height:88px;padding:14px}
.mv-hud .mv-b.sm{width:56px;height:56px;padding:12px}
.mv-hud .mv-b.hide{display:none}
.mv-hud .mv-b.pulse{animation:mvp 1s ease-in-out infinite}
@keyframes mvp{50%{transform:scale(1.1);box-shadow:0 0 0 6px rgba(255,211,74,.45)}}
.mv-gauges{position:absolute;display:flex;gap:8px;align-items:center;pointer-events:none;flex-wrap:wrap;max-width:60vw}
.mv-chip{display:flex;align-items:center;gap:5px;background:rgba(20,16,48,.55);border-radius:14px;padding:4px 9px;font-size:15px;font-weight:600;white-space:nowrap}
.mv-chip i{display:block;width:22px;height:22px}
.mv-bar{width:70px;height:10px;border-radius:5px;background:rgba(255,255,255,.25);overflow:hidden}
.mv-bar b{display:block;height:100%;background:#ffd34a;border-radius:5px;transition:width .2s}
.mv-bar.low b{background:#ff4f6a}
.mv-spd{font-size:28px;font-weight:700;line-height:1;text-shadow:0 2px 3px rgba(0,0,0,.4)}
.mv-spd small{font-size:12px;opacity:.8;margin-left:2px}
.mv-hint{position:absolute;left:50%;transform:translateX(-50%);background:rgba(20,16,48,.6);border-radius:12px;padding:5px 12px;font-size:14px;pointer-events:none;white-space:nowrap}

.mv-gar{position:absolute;inset:0;z-index:40;background:linear-gradient(160deg,#2a1a5e,#160a3a);color:#fff;font-family:var(--font,'Fredoka',system-ui,sans-serif);display:flex;flex-direction:column;user-select:none;-webkit-user-select:none;touch-action:none}
.mv-top{display:flex;align-items:center;gap:8px;padding:6px 10px;flex:0 0 auto;flex-wrap:wrap}
.mv-top .mv-t{flex:1;font-size:18px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mv-ib{width:48px;height:48px;border-radius:14px;border:0;background:rgba(255,255,255,.12);color:#fff;padding:10px;box-sizing:border-box;flex:0 0 auto;display:flex;align-items:center;justify-content:center;cursor:pointer}
.mv-ib.on{background:#ffd34a;color:#2a1a00}
.mv-ib.go{background:#3ec05a;width:auto;padding:8px 14px;gap:6px;font:inherit;font-weight:700;font-size:16px}
.mv-ib.go:disabled{background:rgba(255,255,255,.12);opacity:.6}
.mv-ib.go i{width:24px;height:24px;display:block}
.mv-tabs{display:flex;gap:6px}
.mv-tab{border:0;border-radius:12px;padding:8px 12px;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-weight:600;display:flex;gap:6px;align-items:center;cursor:pointer}
.mv-tab i{width:22px;height:22px;display:block}
.mv-tab.on{background:#fff;color:#2a1a5e}
.mv-main{flex:1;display:flex;gap:10px;min-height:0;padding:0 10px}
.mv-gridw{flex:1;display:flex;align-items:center;justify-content:center;min-width:0;position:relative}
.mv-grid{display:grid;gap:3px;background:rgba(0,0,0,.25);padding:6px;border-radius:12px;position:relative}
.mv-cell{background:rgba(255,255,255,.1);border-radius:6px;position:relative}
.mv-cell.ok{background:rgba(62,192,90,.45)}
.mv-cell.bad{background:rgba(255,79,106,.45)}
.mv-pp{position:absolute;border-radius:8px;display:flex;align-items:center;justify-content:center;pointer-events:none;box-sizing:border-box;border:2px solid rgba(255,255,255,.7)}
.mv-pp.under{border-style:dashed;opacity:.85;background:rgba(0,0,0,.25)!important}
.mv-pp i{display:block;width:80%;height:80%;max-width:40px;max-height:40px}
.mv-front{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:12px;opacity:.75;white-space:nowrap}
.mv-side{width:min(36vw,300px);display:flex;flex-direction:column;gap:8px;min-height:0;overflow-y:auto;touch-action:pan-y}
.mv-prev{flex:1 1 40%;min-height:110px;border-radius:12px;background:radial-gradient(#4a3a8e,#20124e);position:relative;overflow:hidden}
.mv-prev canvas{position:absolute;inset:0;width:100%!important;height:100%!important}
.mv-stats{display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:13px;flex:0 0 auto}
.mv-stat{display:flex;gap:5px;align-items:center;background:rgba(255,255,255,.08);border-radius:8px;padding:3px 6px;white-space:nowrap;overflow:hidden}
.mv-stat i{width:18px;height:18px;display:block;flex:0 0 auto}
.mv-errs{font-size:13px;display:flex;flex-direction:column;gap:3px;flex:0 0 auto}
.mv-err{background:rgba(255,79,106,.3);border-radius:8px;padding:3px 8px}
.mv-warn{background:rgba(255,211,74,.22);border-radius:8px;padding:3px 8px}
.mv-okk{background:rgba(62,192,90,.35);border-radius:8px;padding:3px 8px;font-weight:600}
.mv-tray{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:8px 10px;touch-action:pan-x;scrollbar-width:none}
.mv-tray::-webkit-scrollbar{display:none}
.mv-slot{flex:0 0 auto;width:66px;height:72px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;cursor:pointer;padding:4px;font:inherit}
.mv-slot i{width:40px;height:40px;display:block}
.mv-slot b{position:absolute;right:4px;top:3px;font-size:12px;background:rgba(0,0,0,.45);border-radius:8px;padding:0 5px}
.mv-slot b.zero{background:#ff4f6a}
.mv-slot.on{background:#ffd34a;color:#2a1a00}
.mv-slot.dim{opacity:.45}
.mv-slot small{font-size:10px;line-height:1;max-width:62px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mv-list{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;padding:4px 10px 10px;align-content:start;touch-action:pan-y}
.mv-card{background:rgba(255,255,255,.1);border-radius:12px;padding:8px;display:flex;gap:8px;align-items:center}
.mv-card>i{width:44px;height:44px;display:block;flex:0 0 auto}
.mv-card .mv-cb{flex:1;min-width:0}
.mv-card .mv-cn{font-weight:700;font-size:15px}
.mv-card .mv-cd{font-size:12px;opacity:.8}
.mv-ing{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}
.mv-ing span{display:flex;align-items:center;gap:2px;font-size:12px;background:rgba(0,0,0,.25);border-radius:8px;padding:1px 5px}
.mv-ing span.miss{background:rgba(255,79,106,.5)}
.mv-ing i{width:16px;height:16px;display:block}
.mv-card button{border:0;border-radius:10px;background:#3ec05a;color:#fff;font:inherit;font-weight:700;padding:8px 10px;min-width:48px;min-height:44px;cursor:pointer}
.mv-card button:disabled{background:rgba(255,255,255,.15);opacity:.6}
.mv-paints{display:flex;gap:6px;flex-wrap:wrap}
.mv-paints button{width:30px;height:30px;border-radius:50%;border:3px solid transparent;cursor:pointer}
.mv-paints button.on{border-color:#fff}
.mv-toast{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:6px 14px;border-radius:12px;font-size:14px;pointer-events:none;transition:opacity .3s;white-space:nowrap}
@media (max-height:420px){.mv-slot{height:62px;width:58px}.mv-slot i{width:32px;height:32px}.mv-top{padding:4px 10px}.mv-ib{width:42px;height:42px;padding:9px}}
@media (max-width:700px){.mv-tab span{display:none}.mv-top .mv-t{flex-basis:100%;order:9}}
@media (orientation:portrait){.mv-main{flex-direction:column}.mv-side{width:auto;flex-direction:row;flex-wrap:wrap}.mv-prev{flex:1 1 45%;min-height:140px}.mv-stats{flex:1 1 50%}}
`;
let done = false;
export function ensureVehCss(): void {
  if (done || typeof document === 'undefined') return;
  done = true;
  const s = document.createElement('style');
  s.id = 'mv-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
