/* MONTA & LEVA — CSS (injetado uma vez). Visual claro, minimalista, botões grandes e espaçados. */
const CSS = `
.ml-root{--mlb:max(var(--edge-b,0px),var(--safe-bot,env(safe-area-inset-bottom,0px)));position:absolute;inset:0;overflow:hidden;background:#f3f5f8;color:#26303d;font-family:var(--font,'Fredoka'),system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent}
.ml-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.ml-ui{position:absolute;inset:0;pointer-events:none}
.ml-ui>*{pointer-events:auto}
.ml-ui .ml-pass{pointer-events:none}
.ml-fade{animation:mlFade .22s ease-out both}
@keyframes mlFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes mlPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.03);opacity:1}100%{transform:scale(1)}}
@keyframes mlStar{0%{transform:scale(0) rotate(-40deg)}70%{transform:scale(1.25) rotate(8deg)}100%{transform:scale(1)}}
@keyframes mlPulse{0%,100%{box-shadow:0 0 0 0 rgba(47,191,143,.55)}50%{box-shadow:0 0 0 10px rgba(47,191,143,0)}}
.ml-btn{font:inherit;font-weight:600;font-size:15px;border:0;border-radius:14px;background:#fff;color:#26303d;min-height:48px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 1px 0 rgba(38,48,61,.06),0 4px 14px rgba(38,48,61,.08);cursor:pointer;transition:transform .08s,box-shadow .15s,background .15s,opacity .15s;white-space:nowrap}
.ml-btn:active,.ml-btn.tc-pressed{transform:scale(.95)}
.ml-btn svg{width:22px;height:22px;flex:none}
.ml-btn[disabled],.ml-btn.off{opacity:.38;pointer-events:none}
.ml-btn.pri{background:#2fbf8f;color:#fff;box-shadow:0 4px 0 #1f9a71,0 8px 18px rgba(47,191,143,.3)}
.ml-btn.blue{background:#3b6fe0;color:#fff;box-shadow:0 4px 0 #2a54b3,0 8px 18px rgba(59,111,224,.25)}
.ml-btn.ghost{background:transparent;box-shadow:none;color:#5d6878}
.ml-btn.ic{width:48px;padding:0}
.ml-btn.sm{min-height:40px;font-size:13px;border-radius:12px}
.ml-btn.sm.ic{width:40px}
.ml-btn.on{background:#26303d;color:#fff}
.ml-btn.round{border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 1.5px #d5dae1,0 3px 10px rgba(38,48,61,.06)}
.ml-btn.round svg{width:22px;height:22px;stroke-width:2}
.ml-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:#fff;font-size:13px;font-weight:600;box-shadow:0 1px 0 rgba(38,48,61,.05),0 3px 10px rgba(38,48,61,.07);white-space:nowrap}
.ml-chip svg{width:16px;height:16px}
.ml-chip.ok{color:#1f9a71}.ml-chip.bad{color:#d0464a}
.ml-chip.mute{color:#7a8596}
/* ---------- menu ---------- */
.ml-menu{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:max(18px,var(--edge-t,0px)) max(28px,var(--edge-r,0px)) max(18px,var(--mlb,0px)) max(28px,var(--edge-l,0px));pointer-events:none}
.ml-menu>*{pointer-events:auto}
.ml-mcol{display:flex;flex-direction:column;gap:10px;width:min(300px,86vw);background:rgba(255,255,255,.82);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:20px;border-radius:24px;box-shadow:0 10px 40px rgba(38,48,61,.12)}
.ml-logo{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.ml-logo b{font-size:28px;line-height:1;font-weight:700;letter-spacing:.2px}
.ml-logo small{display:block;font-size:12.5px;color:#6b7686;font-weight:500;margin-top:4px}
.ml-mark{width:46px;height:46px;flex:none}
.ml-mcol .ml-btn{justify-content:flex-start;width:100%;font-size:16px}
.ml-mcol .ml-btn.pri{justify-content:center;font-size:18px;min-height:56px}
.ml-mcol .ml-btn small{margin-left:auto;font-weight:500;color:#7a8596;font-size:12.5px}
.ml-mcol .ml-btn.pri small{color:rgba(255,255,255,.85)}
.ml-wallet{display:flex;gap:8px;justify-content:space-between}
@media (orientation:portrait){.ml-menu{justify-content:center;align-items:flex-end;padding-bottom:max(28px,var(--mlb,0px))}}
@media (max-height:460px){.ml-mcol{gap:7px;padding:14px 16px;border-radius:20px}.ml-mcol .ml-btn{min-height:42px;font-size:15px}.ml-mcol .ml-btn.pri{min-height:50px}.ml-logo{margin-bottom:2px}.ml-logo b{font-size:24px}.ml-mark{width:40px;height:40px}.ml-menu{padding-top:10px;padding-bottom:10px}}
/* ---------- telas cheias (fases, oficina, ajustes) ---------- */
.ml-page{position:absolute;inset:0;background:#f3f5f8;display:flex;flex-direction:column;padding:max(10px,var(--edge-t,0px)) max(14px,var(--edge-r,0px)) max(10px,var(--mlb,0px)) max(14px,var(--edge-l,0px));overflow:hidden}
.ml-head{display:flex;align-items:center;gap:10px;min-height:52px;flex:none}
.ml-head h2{margin:0;font-size:22px;font-weight:700;flex:1}
.ml-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y pan-x;padding:4px 2px 14px}
.ml-chaps{display:flex;gap:14px}
@media (orientation:portrait){.ml-chaps{flex-direction:column}}
.ml-chap{flex:1;min-width:0;background:#fff;border-radius:20px;padding:12px;box-shadow:0 4px 18px rgba(38,48,61,.07)}
.ml-chap h3{margin:0 0 10px;font-size:14px;font-weight:600;color:#6b7686;display:flex;justify-content:space-between}
.ml-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.ml-tile{font:inherit;position:relative;aspect-ratio:1;border:0;border-radius:14px;background:#eef2f7;color:#26303d;font-size:18px;font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;transition:transform .08s}
.ml-tile:active{transform:scale(.92)}
.ml-tile.done{background:#e3f6ee}
.ml-tile.cur{background:#2fbf8f;color:#fff;animation:mlPulse 1.6s infinite}
.ml-tile.lock{color:#b3bcc8;pointer-events:none}
.ml-tile.lock svg{width:18px;height:18px}
.ml-stars{display:flex;gap:1px;height:10px}
.ml-stars i{width:10px;height:10px;clip-path:polygon(50% 0,63% 35%,100% 38%,71% 61%,80% 100%,50% 79%,20% 100%,29% 61%,0 38%,37% 35%);background:#cfd6e0}
.ml-stars i.on{background:#ffb547}
.ml-tile.cur .ml-stars i{background:rgba(255,255,255,.45)}
.ml-head h2 small{display:block;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase}
.ml-chaps2{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.ml-chcard{font:inherit;position:relative;display:flex;align-items:center;gap:12px;border:0;border-radius:20px;background:#fff;padding:12px 14px 18px;text-align:left;color:#26303d;cursor:pointer;box-shadow:0 4px 18px rgba(38,48,61,.07);overflow:hidden;min-height:76px;transition:transform .08s}
.ml-chcard:active{transform:scale(.97)}
.ml-chcard::before{content:'';position:absolute;inset:0;background:var(--tint);opacity:.9;pointer-events:none}
.ml-chcard>*{position:relative}
.ml-chn{width:44px;height:44px;flex:none;border-radius:14px;background:var(--acc);color:#fff;font-size:21px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 -3px 0 rgba(0,0,0,.15)}
.ml-cht{flex:1;min-width:0}
.ml-cht b{display:block;font-size:15.5px;line-height:1.15}
.ml-cht small{display:flex;align-items:center;gap:4px;color:#6b7686;font-size:13px;font-weight:600;margin-top:3px}
.ml-cht small svg{width:16px;height:16px}
.ml-chbar{position:absolute;left:14px;right:14px;bottom:8px;height:5px;border-radius:3px;background:rgba(38,48,61,.08);overflow:hidden}
.ml-chbar i{display:block;height:100%;background:var(--acc);border-radius:3px}
.ml-chcard.lock{opacity:.55}
.ml-chcard.lock .ml-chn{background:#b3bcc8}
.ml-tiles2{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:10px;max-width:760px;margin:0 auto}
.ml-tag{position:absolute;top:5px;right:5px;width:9px;height:9px;border-radius:50%}
.ml-tag.bot{background:#8b5cf6}
.ml-tag.wire{background:#7cc6f2}
.ml-grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.ml-card{background:#fff;border-radius:20px;padding:14px;box-shadow:0 4px 18px rgba(38,48,61,.07);display:flex;gap:12px;align-items:center}
.ml-card .ml-ci{width:52px;height:52px;border-radius:14px;background:#eef2f7;display:flex;align-items:center;justify-content:center;flex:none}
.ml-card .ml-ci svg{width:30px;height:30px}
.ml-card .ml-ct{flex:1;min-width:0}
.ml-card b{display:block;font-size:15.5px}
.ml-card small{display:block;color:#6b7686;font-size:12.5px;margin-top:2px;line-height:1.25}
.ml-lv{display:flex;gap:4px;margin-top:6px}
.ml-lv i{width:18px;height:6px;border-radius:3px;background:#dfe4ec}
.ml-lv i.on{background:#2fbf8f}
.ml-sw{display:flex;gap:4px}
.ml-sw i{width:16px;height:16px;border-radius:5px;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.15)}
.ml-sec{font-size:13px;font-weight:600;color:#6b7686;margin:14px 4px 8px;text-transform:uppercase;letter-spacing:.6px}
.ml-tog{font:inherit;width:100%;display:flex;align-items:center;gap:12px;border:0;background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:10px;box-shadow:0 3px 12px rgba(38,48,61,.06);cursor:pointer;color:#26303d;text-align:left}
.ml-tog span{flex:1;font-size:15.5px;font-weight:600}
.ml-tog span small{display:block;font-size:12.5px;font-weight:500;color:#6b7686}
.ml-tog i{width:46px;height:28px;border-radius:14px;background:#dfe4ec;position:relative;transition:background .15s;flex:none}
.ml-tog i::after{content:'';position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s}
.ml-tog.on i{background:#2fbf8f}
.ml-tog.on i::after{transform:translateX(18px)}
/* ---------- montagem ---------- */
.ml-top{position:absolute;left:max(10px,var(--edge-l,0px));right:max(10px,var(--edge-r,0px));top:max(8px,var(--edge-t,0px));display:flex;align-items:center;gap:8px;pointer-events:none}
.ml-top>*{pointer-events:auto}
.ml-title{display:flex;flex-direction:column;line-height:1.05;margin-right:4px}
.ml-title b{font-size:17px}
.ml-title small{font-size:11.5px;color:#6b7686;font-weight:500}
.ml-goals{display:flex;gap:6px;flex-wrap:nowrap;overflow:hidden}
.ml-sp{flex:1}
.ml-tray{position:absolute;left:max(10px,var(--edge-l,0px));bottom:max(8px,var(--mlb,0px));display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:4px 4px 6px;touch-action:pan-x;scrollbar-width:none;background:rgba(255,255,255,.86);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border-radius:20px;box-shadow:0 6px 24px rgba(38,48,61,.10)}
.ml-tray::-webkit-scrollbar{display:none}
.ml-slot{font:inherit;position:relative;flex:none;width:70px;height:70px;border:0;border-radius:14px;background:#f1f4f8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:grab;color:#26303d;padding:0;transition:background .12s,transform .08s;touch-action:none}
.ml-slot canvas{width:38px;height:38px;pointer-events:none}
.ml-slot em{font-style:normal;font-size:10px;line-height:1.05;font-weight:600;color:#6b7686;max-width:66px;overflow:hidden;text-align:center;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;pointer-events:none}
.ml-slot b{position:absolute;top:3px;right:4px;font-size:11px;font-weight:700;background:#26303d;color:#fff;border-radius:8px;min-width:18px;height:16px;line-height:16px;padding:0 4px;pointer-events:none}
.ml-slot.armed{background:#dfe9ff;box-shadow:inset 0 0 0 2px #3b6fe0}
.ml-slot.empty{opacity:.35}
.ml-slot.empty b{background:#9aa5b5}
.ml-slot .ml-new{position:absolute;left:4px;top:3px;width:8px;height:8px;border-radius:50%;background:#ef5d60;box-shadow:0 0 0 2px #fff}
.ml-slot .ml-cost{position:absolute;left:4px;top:2px;font-size:10px;font-weight:700;color:#3b6fe0}
.ml-acts{position:absolute;right:max(10px,var(--edge-r,0px));bottom:max(8px,var(--mlb,0px));display:grid;grid-template-columns:48px 48px;gap:8px;align-items:end}
.ml-acts .ml-test{grid-column:1/3;min-height:60px;font-size:17px;border-radius:18px}
.ml-acts .ml-test svg{width:26px;height:26px}
@media (orientation:portrait){
  .ml-acts{left:max(10px,var(--edge-l,0px));grid-template-columns:repeat(4,48px) 1fr;bottom:calc(max(8px,var(--mlb,0px)) + 88px)}
  .ml-acts .ml-test{grid-column:auto;min-height:48px;border-radius:14px}
  .ml-tray{right:max(10px,var(--edge-r,0px))}
  .ml-goals{display:none}
}
.ml-info{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:12px;background:#26303d;color:#fff;font-size:12.5px;max-width:min(520px,80vw);box-shadow:0 6px 20px rgba(0,0,0,.18);pointer-events:none;transition:opacity .15s}
.ml-info b{font-weight:700}
.ml-info.hide{opacity:0}
.ml-warn{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none}
.ml-warn .ml-chip{color:#c17a10;background:#fff8e8}
/* ---------- pista ---------- */
.ml-hud{position:absolute;left:50%;transform:translateX(-50%);top:max(10px,var(--edge-t,0px));display:flex;align-items:center;gap:8px;pointer-events:none}
.ml-time{font-variant-numeric:tabular-nums;min-width:66px;justify-content:center}
.ml-pips{display:flex;gap:4px;align-items:center}
.ml-pips i{width:12px;height:12px;border-radius:4px;background:#ffb547;box-shadow:inset 0 0 0 1.5px rgba(38,48,61,.35)}
.ml-pips i.in{background:#2fbf8f}
.ml-pips i.lost{background:#e3e7ee;box-shadow:inset 0 0 0 1.5px #ef5d60}
.ml-drive{position:absolute;bottom:max(14px,var(--mlb,0px));display:flex;gap:12px;align-items:flex-end}
.ml-drive.l{left:max(16px,var(--edge-l,0px))}
.ml-drive.r{right:max(16px,var(--edge-r,0px))}
.ml-pad{font:inherit;width:78px;height:78px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#26303d;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 rgba(38,48,61,.08),0 8px 24px rgba(38,48,61,.14);cursor:pointer}
.ml-pad svg{width:36px;height:36px}
.ml-pad.go{width:92px;height:92px;background:#2fbf8f;color:#fff;box-shadow:0 5px 0 #1f9a71,0 10px 26px rgba(47,191,143,.35)}
.ml-pad.go svg{width:42px;height:42px}
.ml-pad.sm{width:64px;height:64px}
.ml-pad.sm svg{width:28px;height:28px}
.ml-pad.jet{background:#ff7a59;color:#fff;box-shadow:0 4px 0 #c94a2b}
.ml-pad.tc-pressed{filter:brightness(.92)}
.ml-bpads{position:absolute;left:0;right:0;bottom:max(14px,var(--mlb,0px));display:flex;justify-content:space-between;align-items:flex-end;padding:0 max(16px,var(--edge-r,0px)) 0 max(16px,var(--edge-l,0px));pointer-events:none}
.ml-bpads>div{display:flex;gap:14px;align-items:flex-end;pointer-events:none}
.ml-bpad{font:inherit;pointer-events:auto;position:relative;width:86px;height:86px;border-radius:22px;border:0;background:#cfd4db;box-shadow:inset 0 -5px 0 #a9b0ba,0 8px 20px rgba(38,48,61,.16);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;touch-action:none}
.ml-bpad i{width:60px;height:60px;border-radius:50%;background:var(--cap);box-shadow:inset 0 -6px 0 rgba(0,0,0,.2),inset 0 5px 0 rgba(255,255,255,.3),0 3px 0 rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .06s}
.ml-bpad i svg{width:28px;height:28px}
.ml-bpad.tc-pressed i,.ml-bpad.on i{transform:translateY(3px) scale(.95);box-shadow:inset 0 -2px 0 rgba(0,0,0,.2),inset 0 3px 0 rgba(255,255,255,.25)}
.ml-bpad.sm{width:70px;height:70px;border-radius:18px}
.ml-bpad.sm i{width:48px;height:48px}
@media (max-height:420px){.ml-bpad{width:74px;height:74px}.ml-bpad i{width:52px;height:52px}}
.ml-fuel{position:absolute;left:8px;right:8px;bottom:8px;height:5px;border-radius:3px;background:rgba(255,255,255,.4);overflow:hidden;pointer-events:none}
.ml-fuel i{display:block;height:100%;background:#fff;border-radius:3px}
/* ---------- resultado ---------- */
.ml-ov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(243,245,248,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.ml-res{width:min(400px,92vw);max-height:94%;overflow:auto;background:#fff;border-radius:26px;padding:18px 20px 16px;box-shadow:0 20px 60px rgba(38,48,61,.22);animation:mlPop .32s ease-out both;text-align:center}
.ml-res h2{margin:0;font-size:26px}
.ml-res .ml-big{display:flex;justify-content:center;gap:10px;margin:8px 0 6px}
.ml-res .ml-big i{width:46px;height:46px;clip-path:polygon(50% 0,63% 35%,100% 38%,71% 61%,80% 100%,50% 79%,20% 100%,29% 61%,0 38%,37% 35%);background:#e3e7ee}
.ml-res .ml-big i.on{background:#ffb547;animation:mlStar .45s ease-out both}
.ml-gl{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.ml-gl div{display:flex;align-items:center;gap:8px;font-size:14px;text-align:left;padding:7px 10px;border-radius:12px;background:#f3f5f8}
.ml-gl div svg{width:18px;height:18px;flex:none}
.ml-gl div span{flex:1}
.ml-gl div em{font-style:normal;color:#6b7686;font-size:13px}
.ml-gl div.ok{background:#e3f6ee}
.ml-gl div.ok>svg:last-child{color:#1f9a71}
.ml-rw{display:flex;justify-content:center;gap:8px;margin:6px 0 12px}
.ml-row{display:flex;gap:8px;justify-content:center}
.ml-row .ml-btn{flex:1}
.ml-fail{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:18px;background:#fff;color:#d0464a;font-size:19px;font-weight:700;box-shadow:0 10px 36px rgba(208,70,74,.25);animation:mlPop .25s ease-out both;pointer-events:none}
.ml-fail svg{width:26px;height:26px}
.ml-flash{position:absolute;inset:0;background:#ef5d60;opacity:0;pointer-events:none;animation:mlFlash .5s ease-out}
@keyframes mlFlash{0%{opacity:.22}100%{opacity:0}}
/* ---------- tutorial ---------- */
.ml-hand{position:absolute;left:0;top:0;width:44px;height:44px;margin:-6px 0 0 -14px;pointer-events:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.25));z-index:5;will-change:transform}
@keyframes mlTap{0%,100%{scale:1}50%{scale:.82}}
.ml-hand.tap{animation:mlTap .9s ease-in-out infinite;margin:-2px 0 0 -8px}
.ml-tip{position:absolute;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:14px;background:#3b6fe0;color:#fff;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(59,111,224,.35);pointer-events:none;max-width:min(460px,86vw);text-align:center;animation:mlFade .25s ease-out both}
.ml-tipic{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px}
.ml-tipic canvas{width:30px;height:30px;background:#fff;border-radius:8px;padding:2px}
.ml-tipic b svg{width:18px;height:18px;display:block}
.ml-tip.pad{display:flex;align-items:center;gap:8px}
.ml-rot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:8px;color:#6b7686;font-size:13px;pointer-events:none}
`;

let done = false;
export function injectMLCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.id = 'ml-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ícones próprios (traço simples, 24×24) */
const S = (d: string, fill = false) =>
  `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const IC = {
  right: S('<path d="M5 12h13M13 6l6 6-6 6"/>'),
  left: S('<path d="M19 12H6M11 6l-6 6 6 6"/>'),
  fwd: S('<path d="M7 4.5v15l12-7.5z"/>', true),
  rev: S('<path d="M17 4.5v15L5 12z"/>', true),
  brake: S('<circle cx="12" cy="12" r="6.5"/><path d="M4.2 6.5a10 10 0 0 0 0 11M19.8 6.5a10 10 0 0 1 0 11M12 8.6v4.2M12 15.4v.1"/>'),
  jet: S('<path d="M12 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-1.6.6-3 1.6-4.2.2 1.4 1 2.4 2.1 2.7C10 8 10.6 5 12 2z"/>', true),
  rotate: S('<path d="M20 11a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>'),
  undo: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: S('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  play: S('<path d="M8 5v14l11-7z"/>', true),
  wrench: S('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.8-.6-.6-2.8z"/>'),
  restart: S('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  eye: S('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  map: S('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>'),
  sliders: S('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  exit: S('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
  clock: S('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  level: S('<path d="M3 18h18M7 18l3-9 4 5 3-6"/>'),
  blocks: S('<rect x="3.5" y="12" width="7" height="7" rx="1.5"/><rect x="13.5" y="12" width="7" height="7" rx="1.5"/><rect x="8.5" y="4" width="7" height="7" rx="1.5"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  x: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  cog: S('<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="m19 13.6 1.7 1.3-1.8 3.1-2-.8a7 7 0 0 1-2 1.2L14.6 21h-3.6l-.3-2.6a7 7 0 0 1-2-1.2l-2 .8L5 15l1.7-1.3a7 7 0 0 1 0-2.4L5 10l1.8-3.1 2 .8a7 7 0 0 1 2-1.2L11 3h3.6l.3 2.6a7 7 0 0 1 2 1.2l2-.8L20.7 9 19 10.3a7 7 0 0 1 0 3.3z"/>'),
  music: S('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  sound: S('<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  target: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),
  warn: S('<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.2"/>'),
  box: S('<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>'),
  glass: S('<path d="M6 3h12l-1.5 16a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z"/><path d="m11 8 2 3-1.5 2.5"/>'),
  flag: S('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  next: S('<path d="M6 12h12M13 6l6 6-6 6"/>'),
  tilt: S('<path d="M4 17h16"/><rect x="6" y="9" width="12" height="5" rx="1.5"/><circle cx="8.5" cy="16" r="1.4"/><circle cx="15.5" cy="16" r="1.4"/>'),
  palette: S('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.2" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>'),
  phone: S('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M3 9a9 9 0 0 1 2-4M21 15a9 9 0 0 1-2 4"/>'),
  bot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6" fill="#a78bfa" stroke="#3b2a6b" stroke-width="1.6"/><circle cx="12" cy="9" r="3" fill="#fff" stroke="#3b2a6b" stroke-width="1.2"/><circle cx="12.5" cy="9" r="1.4" fill="#2a2f38"/><rect x="7.5" y="14" width="9" height="6.5" rx="2" fill="#8b5cf6" stroke="#3b2a6b" stroke-width="1.6"/></svg>`,
  hand: `<svg viewBox="0 0 48 48"><path d="M17 26V9.5a3.5 3.5 0 0 1 7 0V22l1-.6V18a3.4 3.4 0 0 1 6.6-1.1l.4.1a3.4 3.4 0 0 1 6 2.2v.6a3.3 3.3 0 0 1 5 2.8V31c0 8-5 13-12.5 13h-2.7c-4.3 0-7.3-2-9.6-5.6L10.4 31a3.3 3.3 0 0 1 5.4-3.8z" fill="#fff" stroke="#26303d" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
};
