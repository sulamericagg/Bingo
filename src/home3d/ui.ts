/* ============================================================
 *  Interface (DOM) do modo 3D: girar telefone, carregando, HUD,
 *  joystick + olhar, botões de ação grandes, paleta, avisos.
 *  Todo texto via t('home3d.*'); fonte via var(--font).
 * ============================================================ */
import { lockOrientation, reportFailure, restorePortrait } from '../core/orientation';
import { FpsControls } from '../ui/touch';
import { clearNotify, notify, resetNotifyTop, setNotifyTop } from '../ui/notify';
import { t } from '../i18n';

const CSS = `
.h3{position:fixed;inset:0;z-index:9000;background:#12082e;color:#fff;font-family:var(--font,'Fredoka',system-ui,sans-serif);user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;-webkit-tap-highlight-color:transparent}
.h3 *{box-sizing:border-box}
.h3-canvas{position:absolute;inset:0;display:block}
.h3-layer{position:absolute;inset:0}
.h3-btn{font:inherit;font-weight:700;border:0;cursor:pointer;color:#2a0b5c;background:#fff;border-radius:999px;box-shadow:0 4px 0 #2a0b5c33,0 0 0 3px #2a0b5c inset;padding:8px 14px;display:inline-flex;align-items:center;gap:6px;font-size:14px;transition:transform .08s}
.h3-btn:active,.h3-btn.on{transform:scale(.9)}
.h3-btn,.h3-pb,.h3-mb,.h3-act,.h3-drawer .card,.h3-drawer .tab{transition:transform .16s cubic-bezier(.3,1.7,.5,1),background-color .15s,box-shadow .15s}
.h3-layer.painting .h3-left{display:none}
.h3-btn svg{width:20px;height:20px;flex:none}
.h3-btn.sel{background:#ffd84a}
.h3-btn.lock{opacity:.5}
.h3-btn .lk{position:absolute;right:-4px;top:-4px;width:18px;height:18px;background:#2a0b5c;border-radius:50%;display:grid;place-items:center}
.h3-btn .lk svg{width:11px;height:11px}
.h3-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:8px;padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left));pointer-events:none}
.h3-top>*{pointer-events:auto}
.h3-tools{margin-left:auto;display:flex;gap:6px}
.h3-tools .h3-btn{position:relative;padding:7px 11px;font-size:13px}
.h3-title{font-weight:700;font-size:15px;text-shadow:0 2px 0 #2a0b5c;padding:4px 10px;background:#2a0b5c88;border-radius:12px;white-space:nowrap}
.h3-ret{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2a0b5c;pointer-events:none;transition:transform .12s,border-color .12s}
.h3-ret.hot{transform:scale(1.35);border-color:#ffd84a}
.h3-tgt{position:absolute;left:50%;top:calc(50% + 18px);transform:translateX(-50%);font-weight:600;font-size:11px;padding:2px 8px;opacity:.9;border-radius:10px;background:#2a0b5caa;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .15s}
.h3-tgt.on{opacity:1}
.h3-acts{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:calc(var(--safe-bot,env(safe-area-inset-bottom,0px)) + 12px);display:flex;flex-direction:column-reverse;align-items:flex-end;gap:10px;pointer-events:none}
.h3-act{pointer-events:auto;font:inherit;font-weight:700;border:0;border-radius:50%;width:76px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;color:#2a0b5c;background:#fff;box-shadow:0 5px 0 #2a0b5c55,0 0 0 4px #2a0b5c inset;cursor:pointer;transition:transform .08s;position:relative}
.h3-act svg{width:28px;height:28px}
.h3-act.big{width:92px;height:92px;font-size:13px;background:#ffd84a}
.h3-act.small{width:62px;height:62px;font-size:11px}
.h3-act.on{transform:scale(.9);background:#7dffd8}
.h3-act .ring{position:absolute;inset:-6px;border-radius:50%;border:5px solid transparent;border-top-color:#4fd67a;pointer-events:none;opacity:0}
.h3-act.on .ring{opacity:1;animation:h3spin .6s linear infinite}
@keyframes h3spin{to{transform:rotate(360deg)}}
.h3-row{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 8px;background:#2a0b5ccc;border-radius:16px;max-width:calc(100% - 220px);overflow-x:auto;scrollbar-width:none}
.h3-sw{width:30px;height:30px;border-radius:50%;border:3px solid #fff;flex:none;cursor:pointer}
.h3-sw.sel{outline:3px solid #ffd84a;outline-offset:2px}
.h3-prog{position:absolute;left:50%;top:52px;transform:translateX(-50%);width:220px;height:16px;border-radius:9px;background:#2a0b5c;box-shadow:0 0 0 3px #fff;overflow:hidden;display:none}
.h3-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff7ad9,#ffd84a);transition:width .15s}
.h3-prog b{position:absolute;inset:0;text-align:center;font-size:11px;line-height:16px}
.h3-toast{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 46px);transform:translate(-50%,-8px);font-weight:700;font-size:13px;padding:5px 12px;border-radius:999px;background:#2a0b5ce6;color:#fff;box-shadow:0 0 0 2px #ffffff55;opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;white-space:nowrap;max-width:80%;overflow:hidden;text-overflow:ellipsis;z-index:6}
.h3-toast.on{opacity:1;transform:translate(-50%,0)}
.h3-pop{position:absolute;left:0;top:0;z-index:4;background:#2a0b5cee;border-radius:16px;padding:6px 6px 6px;box-shadow:0 0 0 2px #fff,0 6px 16px #0006;transition:opacity .15s;animation:h3pop .18s ease-out;will-change:transform}
.h3-pop .nm{font-size:11px;font-weight:700;text-align:center;opacity:.85;margin:0 0 4px}
.h3-pop .rw{display:flex;gap:4px}
.h3-pb{font:inherit;font-weight:700;font-size:10px;border:0;border-radius:12px;background:#fff;color:#2a0b5c;width:50px;height:46px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;padding:0}
.h3-pb svg{width:20px;height:20px}
.h3-pb[data-id=move]{background:#ffd84a}
.h3-pb[data-id=close]{width:30px;background:#ffffff33;color:#fff}
.h3-pb:active{transform:scale(.92)}
.h3-mbar{position:absolute;right:max(10px,env(safe-area-inset-right));bottom:calc(var(--safe-bot,env(safe-area-inset-bottom,0px)) + 10px);display:flex;gap:8px;align-items:flex-end;z-index:4}
.h3-mb{font:inherit;font-weight:700;font-size:11px;border:0;border-radius:50%;width:58px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#2a0b5c;background:#fff;box-shadow:0 4px 0 #2a0b5c55,0 0 0 3px #2a0b5c inset;cursor:pointer}
.h3-mb svg{width:22px;height:22px}
.h3-mb.go{width:70px;height:70px;background:#5dffa0}
.h3-mb.go.off{background:#ffb3bd}
.h3-mb:active{transform:scale(.92)}
.h3-drawer{position:absolute;left:50%;bottom:0;width:min(calc(100% - 16px),760px);transform:translate(-50%,105%);transition:transform .26s cubic-bezier(.2,.9,.3,1.15);background:#2a0b5cf2;border-radius:18px 18px 0 0;box-shadow:0 0 0 2px #ffffff44,0 -6px 20px #0005;padding:6px 8px calc(var(--safe-bot,env(safe-area-inset-bottom,0px)) + 8px);z-index:5;display:flex;flex-direction:column;gap:6px}
.h3-drawer.on{transform:translate(-50%,0)}
.h3-drawer .hd{display:flex;gap:6px;align-items:center}
.h3-drawer .tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;flex:1}
.h3-drawer .tab{font:inherit;font-weight:700;font-size:12px;border:0;border-radius:999px;padding:5px 10px;background:#ffffff22;color:#fff;display:flex;align-items:center;gap:4px;flex:none;cursor:pointer}
.h3-drawer .tab svg{width:16px;height:16px}
.h3-drawer .tab.sel{background:#ffd84a;color:#2a0b5c}
.h3-drawer .cls{font:inherit;border:0;border-radius:50%;width:30px;height:30px;background:#fff;color:#2a0b5c;display:grid;place-items:center;flex:none;cursor:pointer;padding:0}
.h3-drawer .cls svg{width:18px;height:18px}
.h3-drawer .body{display:flex;flex-direction:column;gap:6px;min-height:0}
.h3-drawer .cards{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;-webkit-overflow-scrolling:touch}
.h3-drawer .card{font:inherit;font-weight:600;font-size:10px;border:0;border-radius:12px;background:#fff;color:#2a0b5c;width:76px;height:92px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:4px 3px;gap:1px;position:relative;cursor:pointer;line-height:1.1;text-align:center}
.h3-drawer .card img{width:64px;height:56px;object-fit:contain}
.h3-drawer .card span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3-drawer .card em{position:absolute;right:3px;top:3px;font-style:normal;font-size:10px;font-weight:700;border-radius:8px;padding:1px 5px;background:#ffd84a;color:#2a0b5c;display:flex;align-items:center}
.h3-drawer .card em.ok{background:#5dffa0;padding:1px 2px}
.h3-drawer .card em.n{background:#e9e2ff}
.h3-drawer .card em.gem{background:#9ef0ff}
.h3-drawer .card em.lock{background:#2a0b5c;color:#fff}
.h3-drawer .card em svg{width:11px;height:11px}
.h3-drawer .card:active{transform:scale(.94)}
.h3-drawer .surf{display:flex;flex-direction:column;gap:5px}
.h3-drawer .chips{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none}
.h3-drawer .h3-sw{width:24px;height:24px}
.h3-ask{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 48px);transform:translateX(-50%);z-index:8;background:#2a0b5cf2;border-radius:16px;padding:10px 12px;box-shadow:0 0 0 2px #fff,0 8px 20px #0006;text-align:center;max-width:min(360px,90%);animation:h3pop .18s}
.h3-ask p{margin:0 0 8px;font-size:14px;font-weight:600}
.h3-ask .rw{display:flex;gap:8px;justify-content:center}
.h3-coach{position:absolute;inset:0;z-index:9;background:#12082e99;display:flex;align-items:center;justify-content:center;animation:h3fade .25s}
@keyframes h3fade{from{opacity:0}}
.h3-coach .cd{background:#fff;color:#2a0b5c;border-radius:20px;padding:14px 16px 12px;width:min(420px,88%);box-shadow:0 0 0 4px #2a0b5c inset,0 10px 30px #0008;text-align:center}
.h3-coach .ic{width:64px;height:64px;margin:0 auto 6px;border-radius:50%;background:#ffd84a;display:grid;place-items:center;box-shadow:0 0 0 3px #2a0b5c inset}
.h3-coach .ic svg{width:36px;height:36px}
.h3-coach h3{margin:0 0 4px;font-size:17px}
.h3-coach p{margin:0 0 10px;font-size:13px;opacity:.85}
.h3-coach .dots{display:flex;gap:5px;justify-content:center;margin-bottom:10px}
.h3-coach .dots i{width:8px;height:8px;border-radius:50%;background:#2a0b5c33}
.h3-coach .dots i.on{background:#2a0b5c}
.h3-coach .rw{display:flex;gap:8px;justify-content:center}
.h3-tip{position:absolute;padding:6px 10px;border-radius:10px;background:#2a0b5c;color:#fff;font-size:12px;font-weight:600;pointer-events:none;white-space:nowrap;z-index:5;box-shadow:0 0 0 2px #fff}
.h3-full{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px;background:radial-gradient(circle at 50% 40%,#5a3fb0,#2a1a63 55%,#12082e)}
.h3-full h2{margin:0;font-size:24px;text-shadow:0 3px 0 #2a0b5c}
.h3-full p{margin:0;opacity:.9;max-width:420px}
.h3-phone{width:70px;height:120px;border-radius:16px;border:6px solid #fff;position:relative;animation:h3rot 2.2s ease-in-out infinite;box-shadow:0 6px 0 #2a0b5c}
.h3-phone:after{content:'';position:absolute;left:50%;bottom:6px;width:16px;height:4px;margin-left:-8px;border-radius:2px;background:#fff}
.h3-phone i{position:absolute;inset:8px 6px 16px;border-radius:6px;background:linear-gradient(135deg,#ff7ad9,#ffd84a)}
@keyframes h3rot{0%,20%{transform:rotate(0)}45%,75%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
.h3-bar{width:min(320px,70vw);height:22px;border-radius:12px;background:#2a0b5c;box-shadow:0 0 0 4px #fff;overflow:hidden;position:relative}
.h3-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:repeating-linear-gradient(-45deg,#ffd84a 0 14px,#ffb03d 14px 28px);transition:width .2s;animation:h3stripe .6s linear infinite;background-size:40px 40px}
@keyframes h3stripe{to{background-position:40px 0}}
.h3-load-house{width:120px;height:100px;position:relative}
.h3-load-house b{position:absolute;bottom:0;width:22px;border-radius:6px 6px 0 0;background:#fff;animation:h3bounce 1s ease-in-out infinite}
@keyframes h3bounce{0%,100%{transform:scaleY(.6)}50%{transform:scaleY(1)}}
.h3-step{font-size:13px;opacity:.85;min-height:18px}
.h3-cat{position:absolute;left:0;right:0;bottom:0;max-height:46%;background:#2a0b5cee;border-radius:18px 18px 0 0;padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;transform:translateY(100%);transition:transform .2s}
.h3-cat.on{transform:none}
.h3-cat .tabs,.h3-cat .grid{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.h3-cat .grid{flex-wrap:wrap;overflow-y:auto;max-height:150px}
.h3-chip{font:inherit;font-weight:700;font-size:12px;border:0;border-radius:12px;padding:7px 10px;background:#fff;color:#2a0b5c;cursor:pointer;display:flex;align-items:center;gap:6px;flex:none}
.h3-chip i{width:14px;height:14px;border-radius:4px;display:inline-block;box-shadow:0 0 0 2px #2a0b5c}
.h3-chip.sel{background:#ffd84a}
.h3-side{position:absolute;right:max(10px,env(safe-area-inset-right));top:56px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.h3-left .h3-btn{padding:5px 10px;font-size:12px}
.h3-left .h3-btn svg{width:16px;height:16px}
.h3-left{position:absolute;left:max(10px,env(safe-area-inset-left));top:56px;bottom:calc(var(--safe-bot,0px) + 12px);display:flex;flex-direction:column;gap:5px;overflow-y:auto;scrollbar-width:none;align-items:flex-start}
.h3-emote{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);pointer-events:none}
.h3-full .h3-row2{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.h3-full .h3-later{display:none}
.h3-full .h3-later.on{display:inline-flex;animation:h3pop .3s}
@keyframes h3pop{from{transform:scale(.6);opacity:0}}
.h3-load-back{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top))}
.h3-top.compact .h3-btn{padding:6px 10px;font-size:13px}
.h3-top.compact>.h3-btn:first-child span{display:none}
.h3-top.compact>.h3-btn:first-child{padding:6px 8px}
.h3-tools{position:relative}
.h3-pchip{position:absolute;left:50%;transform:translateX(-50%);top:calc(max(8px,env(safe-area-inset-top)) + 74px);display:flex;gap:6px;align-items:flex-start;justify-content:center;flex-wrap:wrap;width:min(92vw,420px);z-index:4;pointer-events:none}
.h3-pchip>*{pointer-events:auto}
.h3-pchip .cur,.h3-pchip .un{font:inherit;font-weight:700;font-size:12px;border:0;border-radius:999px;background:#2a0b5cdd;color:#fff;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;box-shadow:0 0 0 2px #ffffff55;cursor:pointer;transition:transform .08s}
.h3-pchip .cur i{width:26px;height:26px;border-radius:50%;border:3px solid #fff;display:block}
.h3-pchip .un{padding:5px;width:34px;height:34px;justify-content:center}
.h3-pchip .un svg{width:20px;height:20px}
.h3-pchip .un.off{opacity:.4}
.h3-pchip button:active{transform:scale(.9)}
.h3-pchip .pan{flex-basis:100%;background:#2a0b5cee;border-radius:14px;padding:8px;box-shadow:0 0 0 2px #ffffff44;display:flex;flex-direction:column;gap:6px;animation:h3pop .16s}
.h3-pchip .fins,.h3-pchip .cols{display:flex;flex-wrap:wrap;gap:5px}
.h3-pchip .h3-sw{width:26px;height:26px;padding:0}
.h3-tcur .car{font-style:normal;font-size:11px;margin-left:2px;opacity:.7}
.h3-tmenu{position:absolute;right:0;top:calc(100% + 6px);display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:6px;border-radius:16px;background:#2a0b5cee;box-shadow:0 0 0 2px #ffffff55,0 8px 20px #0006;z-index:7;animation:h3pop .15s;min-width:150px}
.h3-tmenu .h3-btn{justify-content:flex-start;font-size:13px;padding:6px 10px}
@media (orientation:portrait){
.h3-title{font-size:12px;max-width:34vw;overflow:hidden;text-overflow:ellipsis}
.h3-prog{top:60px}
.h3-row{left:10px;right:10px;transform:none;max-width:none;bottom:auto;top:96px}
.h3-act{width:60px;height:60px;font-size:10px}
.h3-act.big{width:72px;height:72px}
.h3-act.small{width:50px;height:50px}
.h3-act svg{width:22px;height:22px}
.h3-side,.h3-left{top:60px}
.h3-cat{max-height:42%}
.h3-toast{font-size:14px;white-space:normal;text-align:center;max-width:86%}
.h3-ret{width:18px;height:18px;margin:-9px 0 0 -9px}
}
`;
let cssEl: HTMLStyleElement | null = null;
export function ensureCss(): void {
  if (cssEl) return;
  cssEl = document.createElement('style');
  cssEl.textContent = CSS;
  document.head.appendChild(cssEl);
}
export function removeCss(): void {
  cssEl?.remove();
  cssEl = null;
}

/* ---------------- ícones (SVG simples, originais) ---------------- */
const P = (d: string, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON: Record<string, string> = {
  exit: P('<path d="M15 5l-7 7 7 7"/>'),
  hand: P('<path d="M7 12V6.5a1.5 1.5 0 013 0V11m0-5.5v-1a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v6m0-3a1.5 1.5 0 013 0v5c0 4-3 6-6 6h-1c-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.5L7 15"/>'),
  grab: P('<path d="M6 11c0-2 1-3 2.5-3S11 9 11 9V7c0-1 .8-2 2-2s2 1 2 2v2c0-1 .8-1.5 1.7-1.5S18.5 8 18.5 9v5c0 4-3 6-6.5 6S6 18 6 15z"/>'),
  throw: P('<path d="M5 19c3-8 8-12 14-14"/><path d="M13 5h6v6"/>'),
  kick: P('<path d="M6 4l3 8-3 6h5l2-4 5 1"/><circle cx="19" cy="18" r="2.5"/>'),
  break: P('<path d="M12 3l-2 6 4 2-3 7"/><path d="M5 8l3 2M19 9l-3 2M6 18l3-2M18 17l-3-2"/>'),
  clean: P('<rect x="4" y="9" width="16" height="9" rx="3"/><path d="M8 9V6h8v3"/><circle cx="18" cy="5" r="1.5"/><circle cx="21" cy="8" r="1"/>'),
  paint: P('<rect x="4" y="3" width="13" height="6" rx="2"/><path d="M17 6h3v5h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1.5"/>'),
  build: P('<path d="M3 21h18M5 21V10l7-6 7 6v11"/><path d="M10 21v-6h4v6"/>'),
  fix: P('<path d="M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 10.9 5.5"/>'),
  eat: P('<path d="M4 14h16l-2 6H6z"/><path d="M8 14c0-4 2-7 4-7s4 3 4 7"/><path d="M12 7V4"/>'),
  drop: P('<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 21h14"/>'),
  emote: P('<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  rotate: P('<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>'),
  trash: P('<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>'),
  color: P('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="7.5" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="M12 21c-2 0-2-3 0-4s3-2 3-4"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  check: P('<path d="M5 12l5 5 9-10"/>'),
  eye: P('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  lock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', 'stroke="#fff"'),
  floor: P('<path d="M3 17l9 4 9-4-9-4z"/><path d="M7.5 15l9 4M12 13l-4.5 6"/>'),
  wall: P('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6"/>'),
  party: P('<path d="M4 20l5-14 9 9z"/><path d="M14 4l1 2M19 6l-2 1M20 11h-2"/>'),
  move: P('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  swap: P('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  box: P('<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>'),
  x: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  undo: P('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  sofa: P('<path d="M4 11V8a2 2 0 012-2h12a2 2 0 012 2v3"/><path d="M2 13a2 2 0 014 0v2h12v-2a2 2 0 014 0v5H2z"/><path d="M5 18v2M19 18v2"/>'),
  star: P('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  bulb: P('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>'),
  leaf: P('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>'),
  aerial: P('<path d="M3 10l9-6 9 6"/><path d="M5 9v10h14V9"/><path d="M9 19v-5h6v5"/><path d="M12 1v2"/>'),
  cake: P('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M4 15c2 1 4 1 6 0s4-1 6 0 3 1 4 0"/><path d="M12 11V7"/><path d="M12 4.5v.01"/>'),
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
export function button(label: string, icon: string, cls = 'h3-btn'): HTMLButtonElement {
  const b = el('button', cls, (ICON[icon] ?? '') + `<span>${esc(label)}</span>`);
  b.type = 'button';
  return b;
}
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/* ---------------- girar o telefone ---------------- */
export function isLandscape(): boolean {
  return window.matchMedia('(orientation: landscape)').matches || window.innerWidth > window.innerHeight;
}
/** Promessa com prazo: resolve com `fb` se demorar (ex.: plugin de orientação que não responde). */
function within<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return new Promise((res) => {
    const tm = setTimeout(() => res(fb), ms);
    p.then(
      (v) => (clearTimeout(tm), res(v)),
      () => (clearTimeout(tm), res(fb)),
    );
  });
}
/**
 * Pede paisagem. NUNCA espera o plugin sem prazo (antes: se o lock não respondesse, ficava só o fundo
 * azul do 3D para sempre). Mostra o aviso na hora, com "Voltar" e, depois de 2 s,
 * "Continuar assim mesmo" (o 3D funciona em retrato — o celular pode estar com a rotação travada).
 */
/** o jogador escolheu jogar em pé ("Continuar assim mesmo"): não insistimos em paisagem */
let portraitChosen = false;
export const playsPortrait = (): boolean => portraitChosen;
export async function askLandscape(root: HTMLElement, skip: boolean): Promise<boolean> {
  portraitChosen = false;
  if (skip) return true;
  // espera o plugin (com prazo) e confere de verdade; tenta de novo antes de mostrar o aviso
  const fails: string[] = [];
  for (const o of ['landscape', 'landscape-primary'] as const) {
    const r = await within(lockOrientation(o), 1500, { ok: false, err: 'timeout' });
    if (!r.ok) fails.push(`${o}:${r.err}`);
    // a rotação nativa leva um instante para refletir em innerWidth/innerHeight
    if (!isLandscape()) await new Promise((r) => setTimeout(r, 800));
    if (isLandscape()) return true;
  }
  reportFailure('casa3d', fails, screen.orientation?.type ?? '');
  const box = el(
    'div',
    'h3-full h3-rotate',
    `<div class="h3-phone"><i></i></div><h2>${esc(t('home3d.rotate.title', 'Vire o telefone!'))}</h2><p>${esc(t('home3d.rotate.text2', 'O modo 3D fica melhor deitado. Se o seu celular não girar, toque em "Continuar assim mesmo".'))}</p>`,
  );
  const row = el('div', 'h3-row2');
  const cancel = button(t('home3d.rotate.back', 'Voltar'), 'exit');
  cancel.dataset.act = 'back';
  const anyway = button(t('home3d.rotate.anyway', 'Continuar assim mesmo'), 'check');
  anyway.classList.add('sel', 'h3-later');
  row.append(cancel, anyway);
  box.appendChild(row);
  root.appendChild(box);
  const showT = setTimeout(() => anyway.classList.add('on'), 2000);
  return new Promise((res) => {
    const mq = window.matchMedia('(orientation: landscape)');
    let fin = false;
    const done = (ok: boolean) => {
      if (fin) return;
      fin = true;
      clearTimeout(showT);
      mq.removeEventListener?.('change', chk);
      window.removeEventListener('resize', chk);
      box.remove();
      res(ok);
    };
    const chk = () => {
      if (isLandscape()) done(true);
    };
    mq.addEventListener?.('change', chk);
    window.addEventListener('resize', chk);
    cancel.onclick = () => done(false);
    anyway.onclick = () => {
      // joga em retrato: solta a trava de paisagem para a tela não girar no meio do jogo
      portraitChosen = true;
      restorePortrait();
      done(true);
    };
  });
}
export function unlockOrientation(): void {
  restorePortrait();
}

/* ---------------- carregando ---------------- */
export class Loading {
  readonly box: HTMLDivElement;
  private bar: HTMLElement;
  private step: HTMLElement;
  /** Voltar sempre visível no carregamento (e o botão voltar do Android clica nele). */
  readonly back: HTMLButtonElement;
  constructor(root: HTMLElement, onBack: () => void) {
    const cols = ['#ff7ad9', '#ffd84a', '#46d9e6', '#4fd67a', '#8a5cff'];
    const bars = cols.map((c, i) => `<b style="left:${i * 24}px;height:${40 + i * 12}px;background:${c};animation-delay:${i * 0.12}s;transform-origin:bottom"></b>`).join('');
    this.box = el(
      'div',
      'h3-full',
      `<div class="h3-load-house">${bars}</div><h2>${esc(t('home3d.load.title', 'Montando sua casa em 3D'))}</h2><div class="h3-bar"><i></i></div><div class="h3-step"></div>`,
    );
    this.bar = this.box.querySelector('.h3-bar i')!;
    this.step = this.box.querySelector('.h3-step')!;
    this.back = button(t('home3d.rotate.back', 'Voltar'), 'exit', 'h3-btn h3-load-back');
    this.back.dataset.act = 'back';
    this.back.onclick = onBack;
    this.box.appendChild(this.back);
    root.appendChild(this.box);
  }
  set(p: number, label: string): void {
    this.bar.style.width = Math.round(Math.min(1, p) * 100) + '%';
    this.step.textContent = label;
  }
  /** Demorou demais: mostra o erro com um botão grande de voltar. */
  fail(title: string, text: string, onBack: () => void): void {
    this.box.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
    const b = button(t('home3d.fallback.back', 'Ficar no 2D'), 'exit');
    b.dataset.act = 'back';
    b.onclick = onBack;
    this.box.appendChild(b);
  }
  remove(): void {
    this.box.remove();
  }
}

/* ---------------- aviso / fallback ---------------- */
export function fallback(root: HTMLElement, title: string, text: string, tryAnyway: boolean): Promise<'back' | 'try'> {
  const box = el('div', 'h3-full', `<h2>${esc(title)}</h2><p>${esc(text)}</p>`);
  const row = el('div', '', '');
  row.style.cssText = 'display:flex;gap:10px';
  const back = button(t('home3d.fallback.back', 'Ficar no 2D'), 'exit');
  row.appendChild(back);
  let tryB: HTMLButtonElement | null = null;
  if (tryAnyway) {
    tryB = button(t('home3d.fallback.try', 'Tentar mesmo assim'), 'check');
    tryB.classList.add('sel');
    row.appendChild(tryB);
  }
  box.appendChild(row);
  root.appendChild(box);
  return new Promise((res) => {
    back.onclick = () => (box.remove(), res('back'));
    if (tryB) tryB.onclick = () => (box.remove(), res('try'));
  });
}

/* ---------------- entrada FPS: módulo compartilhado (src/ui/touch) + toque curto ----------------
 * Joystick flutuante (anel apagado sempre visível onde ele vai aparecer), arrastar para olhar
 * suave (preferências de Controles), WASD. Aqui só soma o "toque curto" (escolher móvel).
 */
export class FpsInput extends FpsControls {
  /** toque curto fora dos botões e fora da zona do joystick */
  onTap?: (x: number, y: number) => void;
  private t0: { id: number; x: number; y: number; t: number; moved: number } | null = null;
  constructor(
    private host: HTMLElement,
    sens?: number,
  ) {
    super(host, { joystick: { zoneWidth: 0.42, zoneTop: 0.3, hint: true }, look: sens ? { baseSens: sens } : {} });
    host.addEventListener('pointerdown', this.tDown);
    window.addEventListener('pointermove', this.tMove);
    window.addEventListener('pointerup', this.tUp);
  }
  private tDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    const tg = e.target as HTMLElement;
    if (tg.closest?.('button,[data-touch-ignore]')) return;
    const r = this.host.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width,
      fy = (e.clientY - r.top) / r.height;
    const inJoy = fy > 0.3 && (this.joy.side === 'left' ? fx < 0.42 : fx > 0.58);
    if (inJoy) return;
    this.t0 = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  };
  private tMove = (e: PointerEvent) => {
    const t = this.t0;
    if (t && e.pointerId === t.id) t.moved = Math.max(t.moved, Math.hypot(e.clientX - t.x, e.clientY - t.y));
  };
  private tUp = (e: PointerEvent) => {
    const t = this.t0;
    if (!t || e.pointerId !== t.id) return;
    this.t0 = null;
    if (this.enabled && t.moved < 10 && performance.now() - t.t < 380) this.onTap?.(e.clientX, e.clientY);
  };
  override dispose(): void {
    super.dispose();
    this.host.removeEventListener('pointerdown', this.tDown);
    window.removeEventListener('pointermove', this.tMove);
    window.removeEventListener('pointerup', this.tUp);
  }
}

/* ---------------- botões de ação contextuais ---------------- */
export interface ActDef {
  id: string;
  label: string;
  icon: string;
  size?: 'big' | 'small';
  hold?: boolean;
}
export class Actions {
  readonly box: HTMLDivElement;
  private btns = new Map<string, HTMLButtonElement>();
  private sig = '';
  held = new Set<string>();
  onTap?: (id: string) => void;
  /** botão de segurar foi solto (ms = quanto tempo ficou apertado) — toque curto = liga/desliga */
  onRelease?: (id: string, ms: number) => void;
  constructor(layer: HTMLElement) {
    this.box = el('div', 'h3-acts');
    layer.appendChild(this.box);
  }
  set(list: ActDef[]): void {
    const sig = list.map((a) => a.id + a.label).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    const keep = new Set(list.map((a) => a.id));
    for (const [id, b] of this.btns)
      if (!keep.has(id)) {
        b.remove();
        this.btns.delete(id);
        this.held.delete(id);
      }
    list.forEach((a) => {
      let b = this.btns.get(a.id);
      if (!b) {
        b = el('button', 'h3-act' + (a.size ? ' ' + a.size : ''), `<span class="ring"></span>${ICON[a.icon] ?? ''}<span class="lbl"></span>`);
        b.type = 'button';
        b.dataset.id = a.id;
        const id = a.id;
        // toque vale ao SOLTAR dentro do botão (dedo que passa por cima arrastando não aciona nada)
        let armed = false;
        let t0 = 0;
        b.addEventListener('pointerdown', (e) => {
          t0 = performance.now();
          e.stopPropagation();
          e.preventDefault();
          b!.classList.add('on');
          this.held.add(id);
          armed = true;
          try {
            b!.releasePointerCapture?.(e.pointerId);
          } catch {
            /* */
          }
        });
        const rel = () => {
          armed = false;
          b!.classList.remove('on');
          this.held.delete(id);
        };
        b.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          const fire = armed && !a.hold;
          const hold = armed && a.hold;
          rel();
          if (fire) this.onTap?.(id);
          if (hold) this.onRelease?.(id, performance.now() - t0);
        });
        b.addEventListener('pointerleave', rel);
        b.addEventListener('pointercancel', rel);
        this.btns.set(a.id, b);
      }
      b.querySelector('.lbl')!.textContent = a.label;
      this.box.appendChild(b);
    });
  }
}

export class Toast {
  private el: HTMLDivElement;
  private tm = 0;
  /** corner = avisos pequenos do app (src/ui/notify.ts), usados pela Casa 3D */
  constructor(
    layer: HTMLElement,
    private corner = false,
  ) {
    this.el = el('div', 'h3-toast');
    if (!corner) layer.appendChild(this.el);
    else setNotifyTop(54);
  }
  dispose(): void {
    if (!this.corner) return;
    clearNotify();
    resetNotifyTop();
  }
  private last = '';
  private lastT = 0;
  show(text: string, ms = 1400): void {
    if (this.corner) {
      notify(text, { ms: Math.max(1600, ms + 600) });
      return;
    }
    // mesmo aviso repetido em seguida: não pisca de novo
    const now = performance.now();
    if (text === this.last && now - this.lastT < 1200 && this.el.classList.contains('on')) return;
    this.last = text;
    this.lastT = now;
    this.el.textContent = text;
    this.el.classList.add('on');
    clearTimeout(this.tm);
    this.tm = window.setTimeout(() => this.el.classList.remove('on'), ms);
  }
}


/** dica com cadeado sobre um botão bloqueado */
export function lockTip(layer: HTMLElement, anchor: HTMLElement, text: string): void {
  layer.querySelectorAll('.h3-tip').forEach((e) => e.remove());
  const tip = el('div', 'h3-tip');
  tip.textContent = text;
  layer.appendChild(tip);
  const a = anchor.getBoundingClientRect(),
    l = layer.getBoundingClientRect();
  tip.style.top = a.bottom - l.top + 8 + 'px';
  tip.style.right = Math.max(6, l.right - a.right) + 'px';
  setTimeout(() => tip.remove(), 1800);
}
