/* JANGADA BLOOP — CSS (injetado uma vez). Layout tipo Minecraft celular:
 * barra de atalhos embaixo no centro, barras de vida/fome/sede em cima dela,
 * joystick à esquerda, pular/ação à direita, mira no centro, topo mínimo. */
const CSS = `
.jg-root{position:absolute;inset:0;overflow:hidden;background:#0a3a6a;color:#fff;font-family:Fredoka,system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none;
  --sb:var(--safe-bot, env(safe-area-inset-bottom,0px));--sl:max(10px,env(safe-area-inset-left,0px));--sr:max(10px,env(safe-area-inset-right,0px));--st:env(safe-area-inset-top,0px);--ink:#123a5c}
.jg-root canvas.jg-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.jg-touch{position:absolute;inset:0;z-index:2}
.jg-hud{position:absolute;inset:0;z-index:5;pointer-events:none}
.jg-hud button,.jg-hud .jg-pe{pointer-events:auto}
.jg-hud button{font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:none}
/* topo */
.jg-top{position:absolute;top:calc(var(--st) + 6px);left:var(--sl);right:var(--sr);display:flex;align-items:center;gap:6px;height:40px}
.jg-ib{width:40px;height:40px;border-radius:12px;border:0;background:rgba(10,40,80,.55);display:grid;place-items:center;padding:0;cursor:pointer;box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
.jg-ib:active{transform:scale(.92)}
.jg-day{display:flex;align-items:center;gap:5px;height:34px;padding:0 11px 0 6px;border-radius:17px;background:rgba(10,40,80,.55);font:700 16px/1 inherit;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)}
.jg-day small{font-weight:600;opacity:.8;font-size:12px}
.jg-cam{margin-left:auto;display:flex;align-items:center;gap:4px;padding:0 10px 0 6px;width:auto;font:700 13px/1 inherit;color:#fff}
/* objetivos */
.jg-obj{position:absolute;top:calc(var(--st) + 52px);left:var(--sl);max-width:min(300px,42vw);background:rgba(255,250,235,.94);color:var(--ink);border-radius:14px;padding:7px 9px;box-shadow:0 3px 10px rgba(0,0,0,.25);font:600 13px/1.2 inherit;transition:transform .25s, opacity .25s;transform-origin:top left;cursor:pointer}
.jg-obj .r{display:flex;align-items:center;gap:7px;padding:2px 0}
.jg-obj .r b{flex:1;min-width:0}
.jg-obj .r em{font-style:normal;font-weight:800;color:#2a8a4a;white-space:nowrap}
.jg-obj .h{font:800 11px/1 inherit;opacity:.6;text-transform:uppercase;letter-spacing:.4px;margin:2px 0 3px;display:flex;gap:6px;align-items:center}
.jg-obj.mini{padding:4px 8px 4px 5px;border-radius:20px;max-width:none}
.jg-obj.mini .full{display:none}
.jg-obj:not(.mini) .mini{display:none}
.jg-obj .mini{display:flex;align-items:center;gap:5px;font-weight:800}
.jg-obj .bar{height:5px;border-radius:3px;background:#e6dcc4;overflow:hidden;margin-top:2px}
.jg-obj .bar i{display:block;height:100%;background:#3ec05a;border-radius:3px}
.jg-obj.done{animation:jgpop .5s}
@keyframes jgpop{40%{transform:scale(1.08)}}
/* mira */
.jg-ret{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px}
.jg-ret:before,.jg-ret:after{content:'';position:absolute;background:#fff;border-radius:2px;box-shadow:0 0 0 1.5px rgba(10,30,60,.55)}
.jg-ret:before{left:10px;top:4px;width:2px;height:14px}.jg-ret:after{top:10px;left:4px;height:2px;width:14px}
.jg-ret.on:before,.jg-ret.on:after{background:#ffd34a}
.jg-charge{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;display:none}
.jg-hint{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);display:none;align-items:center;gap:5px;background:rgba(10,40,80,.6);border-radius:14px;padding:3px 10px 3px 5px;font:700 13px/1 inherit;white-space:nowrap}
.jg-hint .hp{width:44px;height:6px;border-radius:3px;background:rgba(255,255,255,.3);overflow:hidden}
.jg-hint .hp i{display:block;height:100%;background:#ff5c6a}
/* barra de atalhos */
.jg-bot{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--sb) + 6px);display:flex;flex-direction:column;align-items:center;gap:4px;max-width:calc(100vw - 2*var(--sl) - 330px);min-width:0}
.jg-hot{display:flex;gap:3px;padding:3px;border-radius:12px;background:rgba(10,30,60,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18);max-width:100%;overflow-x:auto;scrollbar-width:none}
.jg-hot::-webkit-scrollbar{display:none}
.jg-slot{flex:none;width:44px;height:44px;border-radius:9px;border:0;background:rgba(255,255,255,.14);position:relative;display:grid;place-items:center;padding:0;cursor:pointer}
.jg-slot.on{background:rgba(255,236,150,.4);box-shadow:inset 0 0 0 3px #ffd34a}
.jg-slot i{position:absolute;right:2px;bottom:0;font:800 12px/1 inherit;font-style:normal;text-shadow:0 1px 2px #000,0 0 3px #000}
.jg-slot.craft{background:#ffd34a;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)}
.jg-bars{display:flex;gap:8px;align-items:center;padding:0 4px}
.jg-bar{display:flex;align-items:center;gap:3px}
.jg-bar>div{width:74px;height:9px;border-radius:5px;background:rgba(0,20,50,.5);box-shadow:0 0 0 1.5px rgba(255,255,255,.55);overflow:hidden}
.jg-bar>div>i{display:block;height:100%;border-radius:5px;transition:width .3s}
.jg-bar.low{animation:jglow .8s infinite alternate}
@keyframes jglow{to{opacity:.45}}
.jg-pal{display:flex;gap:3px;padding:3px;border-radius:12px;background:rgba(255,250,235,.92);max-width:100%;overflow-x:auto;scrollbar-width:none;box-shadow:0 3px 10px rgba(0,0,0,.25)}
.jg-pal::-webkit-scrollbar{display:none}
.jg-pc{flex:none;width:42px;height:42px;border-radius:9px;border:0;background:#fff;display:grid;place-items:center;padding:0;position:relative;box-shadow:inset 0 0 0 2px #e0d4b8;cursor:pointer}
.jg-pc.on{box-shadow:inset 0 0 0 3px #3ec05a;background:#eaffe8}
.jg-pc.no{opacity:.5}
.jg-pc.lock:after{content:'';position:absolute;inset:0;border-radius:9px;background:rgba(255,255,255,.55)}
.jg-cost{display:flex;gap:4px;align-items:center;background:rgba(255,250,235,.95);color:var(--ink);border-radius:12px;padding:2px 8px 2px 4px;font:700 13px/1 inherit;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.jg-cost b{font-weight:800}
.jg-chip{display:inline-flex;align-items:center;gap:1px;padding:1px 5px 1px 1px;border-radius:10px;font:800 12.5px/1 inherit;white-space:nowrap}
.jg-chip.ok{background:#dff7e2;color:#1f7a3a}
.jg-chip.no{background:#ffe0e0;color:#c2263c}
/* direita */
.jg-btn{position:absolute;border:0;border-radius:50%;display:grid;place-items:center;padding:0;cursor:pointer;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 3px rgba(255,255,255,.55),0 3px 8px rgba(0,0,0,.25)}
.jg-btn:active,.jg-btn.down{transform:scale(.92);background:rgba(255,255,255,.4)}
.jg-act{right:calc(var(--sr) + 6px);bottom:calc(var(--sb) + 84px);width:76px;height:76px;background:rgba(255,211,74,.55)}
.jg-act.off{opacity:.45}
.jg-jump{right:calc(var(--sr) + 14px);bottom:calc(var(--sb) + 10px);width:62px;height:62px}
.jg-dive{right:calc(var(--sr) + 86px);bottom:calc(var(--sb) + 10px);width:56px;height:56px;display:none}
.jg-use{right:calc(var(--sr) + 92px);bottom:calc(var(--sb) + 110px);width:60px;height:60px;background:rgba(127,216,255,.55);display:none}
.jg-use small,.jg-act small{position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);font:800 11px/1 inherit;white-space:nowrap;text-shadow:0 1px 2px #000}
.jg-rot{right:calc(var(--sr) + 92px);bottom:calc(var(--sb) + 110px);width:50px;height:50px;display:none}
.jg-x{right:calc(var(--sr) + 100px);bottom:calc(var(--sb) + 170px);width:40px;height:40px;display:none;background:rgba(255,90,110,.6)}
/* pesca */
.jg-fish{position:absolute;left:50%;top:26%;transform:translateX(-50%);width:min(320px,60vw);height:26px;border-radius:13px;background:rgba(10,30,60,.7);box-shadow:0 0 0 3px #fff;display:none;overflow:hidden}
.jg-fish .z{position:absolute;top:0;bottom:0;background:#3ec05a}
.jg-fish .n{position:absolute;top:-3px;bottom:-3px;width:6px;margin-left:-3px;background:#ffd34a;border-radius:3px;box-shadow:0 0 0 2px #123a5c}
.jg-fishtxt{position:absolute;left:50%;top:calc(26% - 32px);transform:translateX(-50%);font:800 18px/1 inherit;text-shadow:0 2px 0 #123a5c;display:none;white-space:nowrap}
/* efeitos de tela */
.jg-flash{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;box-shadow:inset 0 0 120px 40px rgba(255,40,60,.6)}
.jg-flash.on{opacity:1;transition:none}
.jg-uw{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 30%,rgba(60,200,220,.0),rgba(10,60,110,.45));opacity:0;transition:opacity .3s}
.jg-uw.on{opacity:1}
.jg-banner{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%) scale(.6);opacity:0;display:flex;align-items:center;gap:10px;font:800 34px/1 inherit;text-shadow:0 3px 0 #123a5c,0 0 12px rgba(0,0,0,.4);transition:transform .45s cubic-bezier(.2,1.6,.4,1),opacity .35s;white-space:nowrap}
.jg-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.jg-banner small{display:block;font-size:15px;font-weight:700;text-align:center;margin-top:4px}
.jg-fade{position:absolute;inset:0;background:#05102a;opacity:0;pointer-events:none;transition:opacity .8s;z-index:8}
.jg-fade.on{opacity:1}
/* painéis */
.jg-ov{position:absolute;inset:0;z-index:20;background:rgba(6,20,45,.55);display:flex;align-items:center;justify-content:center;padding:calc(var(--st) + 6px) var(--sr) calc(var(--sb) + 6px) var(--sl)}
.jg-card{background:#fff8e8;color:var(--ink);border-radius:20px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.4),inset 0 0 0 3px #f0dfb8;max-width:min(760px,100%);max-height:100%;overflow:auto;position:relative}
.jg-card h2{margin:0 0 8px;font:800 21px/1.1 inherit;display:flex;align-items:center;gap:8px}
.jg-card p{margin:4px 0 10px;font:600 14px/1.35 inherit}
.jg-close{position:absolute;right:8px;top:8px;width:38px;height:38px;border-radius:50%;border:0;background:#ff6a7a;display:grid;place-items:center;padding:0;cursor:pointer;box-shadow:inset 0 -3px 0 rgba(0,0,0,.15)}
.jg-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;margin-top:8px}
.jg-b{border:0;border-radius:14px;padding:9px 16px;font:800 16px/1 inherit;color:#fff;background:#3a8ae8;box-shadow:inset 0 -4px 0 rgba(0,0,0,.18);cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:46px}
.jg-b.g{background:#2fb35a}.jg-b.o{background:#ff8a3a}.jg-b.w{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 2px #e0d4b8,inset 0 -4px 0 #e0d4b8}.jg-b.p{background:#ff4fa3}
.jg-b:disabled{opacity:.45}
.jg-b:active{transform:translateY(2px)}
/* oficina (craft) */
.jg-craft{width:min(720px,94vw);height:min(340px,calc(100vh - 24px));display:flex;flex-direction:column;padding:10px 12px}
.jg-tabs{display:flex;gap:5px;align-items:center;margin-right:46px}
.jg-tab{border:0;border-radius:12px;height:40px;padding:0 10px 0 5px;display:flex;align-items:center;gap:4px;font:800 14px/1 inherit;background:#f0e4c8;color:var(--ink);cursor:pointer}
.jg-tab.on{background:#ffd34a;box-shadow:inset 0 -3px 0 rgba(0,0,0,.12)}
.jg-fire{margin-left:auto;display:flex;align-items:center;gap:4px;font:800 13px/1.1 inherit;background:#ffe8d0;border-radius:12px;padding:3px 8px 3px 3px;white-space:nowrap}
.jg-body{flex:1;min-height:0;display:flex;gap:10px;margin-top:8px}
.jg-grid{flex:1;min-width:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;overflow:auto;align-content:start;padding:2px}
.jg-rc{position:relative;border:0;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 2px #e8dcc0;height:64px;display:grid;place-items:center;padding:0;cursor:pointer}
.jg-rc.on{box-shadow:inset 0 0 0 3px #3a8ae8;background:#eef6ff}
.jg-rc.can:before{content:'';position:absolute;right:5px;top:5px;width:10px;height:10px;border-radius:50%;background:#3ec05a;box-shadow:0 0 0 2px #fff}
.jg-rc.lock{opacity:.5}
.jg-rc i{position:absolute;right:4px;bottom:3px;font:800 12px/1 inherit;font-style:normal}
.jg-side{width:min(250px,36vw);flex:none;background:#fff;border-radius:16px;box-shadow:inset 0 0 0 2px #e8dcc0;padding:8px;display:flex;flex-direction:column;gap:6px;align-items:center;text-align:center;overflow:auto}
.jg-side b{font:800 16px/1.1 inherit}
.jg-side small{font:600 12px/1.25 inherit;opacity:.75}
.jg-costs{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}
.jg-costs .jg-chip{font-size:14px;padding:2px 7px 2px 2px}
.jg-tag{font:800 11px/1 inherit;border-radius:8px;padding:4px 7px;background:#ffe0c8;color:#b0501a;display:inline-flex;align-items:center;gap:3px}
.jg-inv{display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start}
.jg-it{position:relative;width:46px;height:46px;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 2px #e8dcc0;display:grid;place-items:center;border:0;padding:0;cursor:pointer}
.jg-it i{position:absolute;right:3px;bottom:2px;font:800 12px/1 inherit;font-style:normal}
.jg-chest{display:flex;gap:10px;width:min(700px,94vw)}
.jg-chest>div{flex:1;min-width:0;background:#fff;border-radius:14px;padding:8px;box-shadow:inset 0 0 0 2px #e8dcc0}
.jg-chest h3{margin:0 0 6px;font:800 14px/1 inherit;display:flex;align-items:center;gap:6px}
/* menu */
.jg-menu{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:calc(var(--st) + 10px) var(--sr) calc(var(--sb) + 10px) var(--sl);background:linear-gradient(#5ec8ff 0%,#9ae6ff 45%,#1a8ad0 46%,#0a4a8a 100%);overflow:auto}
.jg-menu .ttl{font:800 38px/1 inherit;color:#fff;text-shadow:0 4px 0 #123a5c,0 0 20px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px}
.jg-menu .sub{font:700 14px/1.3 inherit;color:#fff;text-shadow:0 2px 0 #123a5c;text-align:center;max-width:520px}
.jg-modes{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.jg-mode{border:0;border-radius:18px;padding:10px 14px;min-width:150px;display:flex;flex-direction:column;align-items:center;gap:4px;background:#fff8e8;color:var(--ink);box-shadow:inset 0 -5px 0 rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.25);cursor:pointer;font:800 17px/1.1 inherit}
.jg-mode small{font:600 12px/1.2 inherit;opacity:.8;max-width:170px}
.jg-mode.big{background:#ffd34a}
.jg-seg{display:inline-flex;background:rgba(255,255,255,.25);border-radius:14px;padding:3px;gap:3px}
.jg-seg button{border:0;border-radius:11px;padding:7px 11px;font:800 14px/1 inherit;background:transparent;color:#fff;cursor:pointer;display:flex;align-items:center;gap:4px;min-height:38px}
.jg-seg button.on{background:#fff;color:var(--ink)}
.jg-loading{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:linear-gradient(#5ec8ff,#0a4a8a);font:800 22px/1 inherit}
.jg-loading .bar{width:220px;height:12px;border-radius:6px;background:rgba(255,255,255,.3);overflow:hidden}
.jg-loading .bar b{display:block;height:100%;width:0;background:#ffd34a;transition:width .2s}
.jg-name{position:absolute;transform:translate(-50%,-100%);font:700 12px/1 inherit;background:rgba(10,30,60,.55);padding:3px 7px;border-radius:9px;white-space:nowrap;pointer-events:none}
@media (max-height:400px){
  .jg-act{width:68px;height:68px;bottom:calc(var(--sb) + 78px)}
  .jg-jump{width:58px;height:58px}
  .jg-use{bottom:calc(var(--sb) + 100px);right:calc(var(--sr) + 84px);width:56px;height:56px}
  .jg-slot{width:40px;height:40px}
  .jg-craft{padding:8px 10px}
  .jg-menu .ttl{font-size:30px}
}
@media (max-width:780px){.jg-bar>div{width:56px}}
`;
let done = false;
export function injectCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}
