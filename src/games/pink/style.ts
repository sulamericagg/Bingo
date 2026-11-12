/* ============================================================
 *  BLOOP PINK — CSS (HUD estilo Minecraft mobile, tablet "site", caixa, resumo).
 * ============================================================ */
const CSS = `
.pk-root{position:absolute;inset:0;overflow:hidden;background:#1a0f18;font-family:var(--font,'Fredoka',system-ui,sans-serif);color:#3a0d2a;user-select:none;-webkit-user-select:none;
  --sb:var(--safe-bot, env(safe-area-inset-bottom,0px));--sl:max(10px,env(safe-area-inset-left,0px));--sr:max(10px,env(safe-area-inset-right,0px));--st:env(safe-area-inset-top,0px);--pk:#ff5fa2;--pk2:#d63384;--ink:#3a0d2a}
.pk-root canvas.pk-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.pk-hud{position:absolute;inset:0;z-index:5;pointer-events:none}
.pk-tag{position:absolute;left:0;top:0;z-index:1;pointer-events:none;background:rgba(40,10,32,.72);color:#fff;font-weight:800;font-size:13px;line-height:1;padding:4px 8px;border-radius:10px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)}
.pk-tag.lead{background:linear-gradient(#ffeaa0,#ffd34a);color:#5a3a00;box-shadow:0 2px 0 #c08a10}
.pk-tag i{font-style:normal;margin-right:3px}
.pk-lps{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pk-lp{display:flex;align-items:center;gap:6px;min-width:0;min-height:38px;padding:4px 8px;border-radius:14px;background:#fff;color:#2a0b5c;border:3px solid #2a0b5c;box-shadow:0 3px 0 rgba(42,11,92,.5);font-weight:800;font-size:14px}
.pk-lp>i{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid #2a0b5c}
.pk-lp b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk-lp svg{flex:none}
.pk-lp.lead{background:linear-gradient(#fffbe0,#ffd34a)}
.pk-lp.free{background:rgba(255,255,255,.18);color:#fff;border:3px dashed rgba(255,255,255,.7);box-shadow:none;opacity:.85}
.pk-lp.free>i{border-color:rgba(255,255,255,.7)}
.pk-codef{display:flex;gap:8px;align-items:center;justify-content:center}
.pk-codef input{font-family:inherit;font-weight:800;font-size:22px;letter-spacing:4px;text-align:center;width:160px;height:52px;padding:0 8px;border-radius:14px;border:3px solid #2a0b5c;background:#fff;color:#2a0b5c}
.pk-chip.pk-pl{padding:0 9px 0 4px;background:linear-gradient(#e8dcff,#b89cff);color:#2a0b5c;box-shadow:0 2px 0 #6a4ab8}
.pk-hud button,.pk-hud .pk-pe{pointer-events:auto}
.pk-hud button{font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:none;border:0;cursor:pointer}
.pk-top{position:absolute;top:calc(var(--st) + 6px);left:var(--sl);right:var(--sr);display:flex;align-items:center;gap:6px;height:42px}
.pk-ib{width:42px;height:42px;border-radius:50%;background:linear-gradient(#fff,#ffe3ef);box-shadow:0 3px 0 #b03a74,0 5px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;padding:0;flex:none}
.pk-ib:active,.pk-ib.tc-pressed{transform:translateY(2px);box-shadow:0 1px 0 #b03a74}
.pk-chip{height:32px;border-radius:16px;background:rgba(40,10,32,.62);color:#fff;display:flex;align-items:center;gap:4px;padding:0 10px 0 4px;font-weight:700;font-size:15px;white-space:nowrap;box-shadow:inset 0 0 0 2px rgba(255,255,255,.15);flex:none}
.pk-chip svg{flex:none}
.pk-chip.money{background:linear-gradient(#ffeaa0,#ffd34a);color:#5a3a00;box-shadow:0 2px 0 #c08a10}
.pk-chip.money.bump{animation:pkBump .4s}
.pk-chip.money .till{font-style:normal;display:flex;align-items:center;gap:2px;margin-left:4px;padding-left:5px;border-left:2px solid rgba(90,58,0,.25);font-size:13px}
@keyframes pkBump{40%{transform:scale(1.18)}}
.pk-chip .season{font-size:11px;background:#ff5fa2;border-radius:8px;padding:1px 6px;margin-left:4px}
.pk-lvl{position:relative;padding-right:12px}
.pk-lvl i{position:absolute;left:30px;right:10px;bottom:4px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}
.pk-lvl i b{display:block;height:100%;background:#ffd34a;width:0;transition:width .4s}
.pk-sp{flex:1}
.pk-open{height:40px;border-radius:20px;padding:0 12px 0 6px;display:flex;align-items:center;gap:4px;font-weight:800;font-size:14px;color:#fff;background:#3ac48a;box-shadow:0 3px 0 #1f7a52;flex:none}
.pk-open.closed{background:#e8336f;box-shadow:0 3px 0 #8a1440}
.pk-open.pulse{animation:pkPulse 1.2s infinite}
@keyframes pkPulse{50%{transform:scale(1.08);filter:brightness(1.15)}}
.pk-goal{position:absolute;top:calc(var(--st) + 54px);left:var(--sl);max-width:min(52vw,330px);background:rgba(255,255,255,.93);border-radius:14px;padding:6px 10px;display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .35s,opacity .35s;transform-origin:top left}
.pk-goal.mini{transform:scale(.0);opacity:0}
.pk-goal .row{display:flex;align-items:center;gap:6px}
.pk-goal .row.done{opacity:.55;text-decoration:line-through}
.pk-goal .row b{margin-left:auto;font-size:12px;color:#b03a74}
.pk-goal .tut{color:#d63384;font-size:14px}
.pk-gbtn{position:absolute;top:calc(var(--st) + 54px);left:var(--sl);width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.25)}
.pk-ret{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 1.5px rgba(0,0,0,.35);transition:transform .15s}
.pk-ret.on{transform:scale(1.5);border-color:#ffd34a}
.pk-hint{position:absolute;left:50%;top:calc(50% + 20px);transform:translateX(-50%);background:rgba(40,10,32,.66);color:#fff;font-weight:700;font-size:14px;border-radius:12px;padding:3px 10px;display:flex;align-items:center;gap:5px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
.pk-hint:empty{display:none}
.pk-bot{position:absolute;left:50%;bottom:calc(var(--sb) + 6px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px}
.pk-meters{display:flex;gap:6px}
.pk-meter{display:flex;align-items:center;gap:3px;background:rgba(40,10,32,.55);border-radius:10px;padding:2px 6px 2px 2px}
.pk-meter i{width:38px;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;display:block}
.pk-meter i b{display:block;height:100%;width:50%;border-radius:3px;transition:width .5s,background .5s}
.pk-hot{display:flex;gap:4px;padding:4px;border-radius:14px;background:rgba(40,10,32,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.15)}
.pk-slot{width:50px;height:50px;border-radius:10px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;position:relative;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)}
.pk-slot.sel{background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 3px #ff5fa2,0 0 10px #ff5fa2}
.pk-slot small{position:absolute;right:3px;bottom:1px;font-weight:800;font-size:12px;color:#fff;text-shadow:0 1px 2px #000}
.pk-btn{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;font-weight:800;font-size:11px;background:rgba(255,95,162,.6);box-shadow:inset 0 0 0 3px rgba(255,255,255,.55),0 4px 10px rgba(0,0,0,.25);backdrop-filter:blur(2px)}
.pk-btn.tc-pressed{transform:scale(.93);filter:brightness(1.2)}
.pk-btn small{position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);white-space:nowrap;text-shadow:0 1px 2px #000;font-size:11px}
.pk-use{right:calc(var(--sr) + 8px);bottom:calc(var(--sb) + 70px);width:78px;height:78px;background:rgba(255,211,74,.6)}
.pk-use.off{opacity:.4}
.pk-run{right:calc(var(--sr) + 96px);bottom:calc(var(--sb) + 22px);width:56px;height:56px;background:rgba(122,190,255,.55)}
.pk-run.on{background:rgba(255,140,60,.75)}
.pk-drop{right:calc(var(--sr) + 100px);bottom:calc(var(--sb) + 92px);width:54px;height:54px;background:rgba(255,255,255,.35)}
.pk-act2{right:calc(var(--sr) + 14px);bottom:calc(var(--sb) + 166px);width:56px;height:56px;background:rgba(120,220,160,.6)}
.pk-rot{right:calc(var(--sr) + 100px);bottom:calc(var(--sb) + 92px);width:54px;height:54px;background:rgba(255,255,255,.4)}
.pk-cancel{right:calc(var(--sr) + 96px);bottom:calc(var(--sb) + 22px);width:56px;height:56px;background:rgba(232,51,111,.6)}
.pk-hud [hidden]{display:none!important}
.pk-hud.modal .pk-btn,.pk-hud.modal .pk-bot,.pk-hud.modal .pk-ret,.pk-hud.modal .pk-hint,.pk-hud.modal .pk-gbtn,.pk-hud.modal .pk-goal{visibility:hidden}
.pk-bubbles{position:absolute;inset:0;overflow:hidden}
.pk-bub{position:absolute;transform:translate(-50%,-100%);background:#fff;border-radius:14px;padding:3px 8px 3px 4px;display:flex;align-items:center;gap:4px;font-weight:700;font-size:13px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,.25);animation:pkPop .25s;max-width:42vw;overflow:hidden;text-overflow:ellipsis}
.pk-bub:after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-top-color:#fff;border-bottom:0}
.pk-bub.bad{background:#ffe0e8}
.pk-bub.bad:after{border-top-color:#ffe0e8}
.pk-bub.good{background:#e4ffe9}
.pk-bub.good:after{border-top-color:#e4ffe9}
@keyframes pkPop{from{transform:translate(-50%,-80%) scale(.4);opacity:0}}
.pk-float{position:absolute;transform:translate(-50%,-100%);font-weight:900;font-size:18px;color:#ffd34a;text-shadow:0 2px 0 #7a4a00,0 0 6px rgba(0,0,0,.5);animation:pkFloat 1.1s forwards;pointer-events:none;white-space:nowrap}
@keyframes pkFloat{to{transform:translate(-50%,-260%);opacity:0}}
.pk-banner{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%) scale(.5);opacity:0;font-weight:900;font-size:30px;color:#fff;text-shadow:0 3px 0 #b03a74,0 0 14px #ff5fa2;transition:all .3s;pointer-events:none;display:flex;align-items:center;gap:8px;white-space:nowrap}
.pk-banner.on{transform:translate(-50%,-50%) scale(1);opacity:1}
.pk-combo{position:absolute;right:calc(var(--sr) + 8px);top:calc(var(--st) + 56px);background:linear-gradient(#fff6a0,#ffb84a);border-radius:14px;padding:3px 10px 3px 4px;font-weight:900;font-size:18px;display:flex;align-items:center;gap:2px;box-shadow:0 3px 0 #b07a10;transition:transform .2s}
.pk-combo.bump{transform:scale(1.25)}
.pk-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .6s}
.pk-fade.on{opacity:1}
.pk-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,0) 40%,rgba(255,95,162,.55));opacity:0;transition:opacity .3s}
.pk-flash.on{opacity:1;transition:none}

/* painéis (tablet, caixa, resumo, pausa) */
.pk-ov{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(30,8,24,.45);pointer-events:auto;animation:pkFade .2s}
@keyframes pkFade{from{opacity:0}}
.pk-card{background:#fff;border-radius:22px;padding:14px 16px;max-width:min(94vw,640px);max-height:calc(100% - 20px - var(--sb));overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center}
.pk-card h2{margin:2px 0 8px;font-size:22px;display:flex;align-items:center;justify-content:center;gap:8px;color:#b03a74}
.pk-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px}
.pk-b{border:0;border-radius:16px;padding:10px 16px;font:800 16px/1 var(--font,inherit);display:inline-flex;align-items:center;gap:6px;color:#fff;background:#ff5fa2;box-shadow:0 4px 0 #b03a74;cursor:pointer;touch-action:manipulation}
.pk-b:active{transform:translateY(3px);box-shadow:0 1px 0 #b03a74}
.pk-b.g{background:#3ac48a;box-shadow:0 4px 0 #1f7a52}
.pk-b.w{background:#fff;color:#b03a74;box-shadow:0 4px 0 #e0b0c8,inset 0 0 0 2px #ffc6de}
.pk-b.o{background:#ff8a3a;box-shadow:0 4px 0 #a04a10}
.pk-b[disabled]{filter:grayscale(1);opacity:.5}
.pk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:6px 0}
.pk-stat{background:#fff3f8;border-radius:12px;padding:6px;display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;text-align:left}
.pk-stat b{font-size:17px;display:block}

/* TABLET */
.pk-tab{width:min(96vw,980px);height:calc(100% - 14px - var(--sb));max-height:560px;margin-bottom:var(--sb);background:#1c1820;border-radius:26px;padding:12px;box-shadow:0 14px 40px rgba(0,0,0,.5),inset 0 0 0 2px #3a3440;display:flex;animation:pkTabIn .3s cubic-bezier(.2,1.3,.4,1);position:relative}
@keyframes pkTabIn{from{transform:translateY(40px) scale(.92) rotateX(12deg);opacity:0}}
.pk-tab:before{content:'';position:absolute;left:5px;top:50%;width:5px;height:5px;margin-top:-2px;border-radius:50%;background:#444}
.pk-scr{flex:1;border-radius:16px;overflow:hidden;background:#fff7fb;display:flex;flex-direction:column;position:relative}
.pk-url{height:34px;flex:none;background:#f1e8ee;display:flex;align-items:center;gap:6px;padding:0 8px;font-size:13px;font-weight:700;color:#7a5a6a}
.pk-url .bar{flex:1;height:24px;border-radius:12px;background:#fff;display:flex;align-items:center;padding:0 10px;gap:6px;overflow:hidden;white-space:nowrap}
.pk-url .lock{color:#3ac48a}
.pk-url button{width:30px;height:30px;border-radius:50%;border:0;background:#fff;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.pk-site{flex:1;display:flex;min-height:0}
.pk-nav{width:84px;flex:none;background:linear-gradient(#ff8cc0,#ff5fa2);display:flex;flex-direction:column;gap:2px;padding:6px 4px;overflow-y:auto;scrollbar-width:none}
.pk-nav::-webkit-scrollbar{display:none}
.pk-nav button{border:0;background:transparent;border-radius:12px;padding:4px 2px;display:flex;flex-direction:column;align-items:center;gap:1px;font:700 11px/1.1 var(--font,inherit);color:#fff;cursor:pointer;position:relative}
.pk-nav button.on{background:#fff;color:#d63384;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.pk-nav button i{position:absolute;top:2px;right:8px;background:#ffd34a;color:#5a3a00;border-radius:8px;font-style:normal;font-size:10px;padding:0 4px}
.pk-main{flex:1;overflow-y:auto;padding:8px 10px 12px;position:relative;-webkit-overflow-scrolling:touch}
.pk-hero{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.pk-hero canvas{height:34px;width:auto}
.pk-hero .bal{margin-left:auto;font-weight:800;background:#fff3c8;border-radius:12px;padding:4px 10px;display:flex;align-items:center;gap:4px}
.pk-filters{display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
.pk-filters::-webkit-scrollbar{display:none}
.pk-filters button{border:0;border-radius:14px;padding:4px 8px;background:#fff;box-shadow:inset 0 0 0 2px #ffd3e6;font:700 12px var(--font,inherit);display:flex;align-items:center;gap:3px;color:#7a2a50;white-space:nowrap;cursor:pointer;flex:none}
.pk-filters button.on{background:#ff5fa2;color:#fff;box-shadow:none}
.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:7px;margin-top:4px}
.pk-it{background:#fff;border-radius:14px;padding:6px;box-shadow:0 2px 6px rgba(160,40,100,.12),inset 0 0 0 1.5px #ffe0ee;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;position:relative;font-size:12px;font-weight:700;cursor:pointer}
.pk-it canvas{width:72px;height:60px}
.pk-it .nm{font-size:12px;line-height:1.1;min-height:26px;display:flex;align-items:center}
.pk-it .pr{font-weight:800;color:#d63384;font-size:13px;display:flex;align-items:center;gap:2px}
.pk-it .tg{position:absolute;top:4px;left:4px;font-size:10px;background:#ffd34a;border-radius:6px;padding:1px 4px;color:#5a3a00}
.pk-it .tg.hot{background:#ff5fa2;color:#fff}
.pk-it.lock{filter:grayscale(.9);opacity:.6}
.pk-it.lock:after{content:attr(data-lv);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:#3a0d2a;background:rgba(255,255,255,.4);border-radius:14px}
.pk-it.owned{box-shadow:inset 0 0 0 3px #3ac48a}
.pk-it .qty{display:flex;align-items:center;gap:4px;margin-top:2px}
.pk-it .qty button{width:30px;height:30px;border-radius:50%;border:0;background:#ffe0ee;font:800 18px/1 var(--font,inherit);color:#d63384;cursor:pointer}
.pk-it .qty span{min-width:22px;font-size:15px}
.pk-cartbar{position:sticky;bottom:-12px;margin:8px -10px -12px;padding:8px 10px;background:rgba(255,247,251,.96);display:flex;align-items:center;gap:8px;box-shadow:0 -4px 10px rgba(160,40,100,.12);font-weight:800}
.pk-cartbar .pk-b{margin-left:auto}
.pk-sw{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:6px 0}
.pk-sw button{width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2);cursor:pointer}
.pk-sw button.on{outline:3px solid #ff5fa2}
.pk-sec{font-weight:800;font-size:15px;color:#b03a74;margin:10px 0 4px;display:flex;align-items:center;gap:6px;text-align:left}
.pk-line{display:flex;align-items:center;gap:6px;background:#fff;border-radius:12px;padding:5px 8px;margin:4px 0;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1.5px #ffe0ee}
.pk-line .grow{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk-line input[type=range]{width:110px;accent-color:#ff5fa2}
.pk-line .pk-b{padding:6px 10px;font-size:13px}
.pk-chart{width:100%;height:150px;background:#fff;border-radius:12px;box-shadow:inset 0 0 0 1.5px #ffe0ee}
.pk-load{position:absolute;inset:0;background:#fff7fb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-weight:800;color:#b03a74;z-index:3}
.pk-load .spin{width:44px;height:44px;border-radius:50%;border:5px solid #ffd3e6;border-top-color:#ff5fa2;animation:pkSpin .7s linear infinite}
@keyframes pkSpin{to{transform:rotate(360deg)}}
.pk-load .bar{width:180px;height:10px;border-radius:5px;background:#ffd3e6;overflow:hidden}
.pk-load .bar b{display:block;height:100%;width:0;background:#ff5fa2;transition:width .2s}
.pk-bo{position:absolute;inset:0;background:#fff;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;text-align:center;font-weight:800;color:#7a2a50}
.pk-bo .big{font-size:42px;font-weight:900;color:#ff5fa2;letter-spacing:2px}
.pk-tclose{position:absolute;top:-6px;right:-6px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 0 #b03a74,0 4px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5}

/* CAIXA (checkout) */
.pk-ck{position:absolute;left:50%;bottom:calc(var(--sb) + 6px);transform:translateX(-50%);width:min(96vw,720px);background:rgba(255,255,255,.97);border-radius:20px;padding:8px 10px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:15;pointer-events:auto;display:flex;flex-direction:column;gap:6px;animation:pkUp .25s}
@keyframes pkUp{from{transform:translate(-50%,40px);opacity:0}}
.pk-ck .hd{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px}
.pk-ck .hd .tot{margin-left:auto;font-size:20px;color:#d63384}
.pk-ck .items{display:flex;gap:5px;overflow-x:auto;padding:2px;scrollbar-width:none;min-height:58px}
.pk-ck .items::-webkit-scrollbar{display:none}
.pk-ck .item{flex:none;width:56px;height:56px;border-radius:12px;background:#fff3f8;box-shadow:inset 0 0 0 2px #ffd3e6;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer}
.pk-ck .item canvas{width:50px;height:44px}
.pk-ck .item.done{opacity:.35;box-shadow:inset 0 0 0 2px #3ac48a}
.pk-ck .item.done:after{content:'✓';position:absolute;right:2px;top:0;color:#3ac48a;font-weight:900}
.pk-ck .item.next{animation:pkPulse .9s infinite}
.pk-ck .pay{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
.pk-ck .money{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.pk-ck .money button{border:0;border-radius:10px;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font:800 13px var(--font,inherit);touch-action:manipulation}
.pk-ck .money .bill{width:58px;height:34px;background:linear-gradient(#b8f0a0,#7fd16a);box-shadow:inset 0 0 0 2px #4a9a3a,0 2px 0 #3a7a2a;color:#1f4a10}
.pk-ck .money .cn{width:38px;height:38px;border-radius:50%;background:radial-gradient(#ffe680,#e8b830);box-shadow:inset 0 0 0 2px #b08010,0 2px 0 #806010;color:#5a3a00;font-size:11px}
.pk-ck .pk-paytag{display:flex;align-items:center;background:#ffe3ef;border-radius:10px;padding:1px 6px}
.pk-ck i.bill,.pk-ck i.cn{font-style:normal;display:inline-flex;align-items:center;justify-content:center;font:800 12px var(--font,inherit);flex:none}
.pk-ck i.bill{width:52px;height:28px;border-radius:5px;color:#1f3a10;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),0 2px 0 rgba(0,0,0,.25);background:linear-gradient(135deg,#c8f0b0,#8ad070)}
.pk-ck i.b200{background:linear-gradient(135deg,#bfe0ff,#7ab0e8)}.pk-ck i.b500{background:linear-gradient(135deg,#e8c8ff,#b48cd8)}.pk-ck i.b1000{background:linear-gradient(135deg,#ffc8c8,#e88a8a)}
.pk-ck i.b2000{background:linear-gradient(135deg,#fff0a0,#e8c850)}.pk-ck i.b5000{background:linear-gradient(135deg,#ffd8a8,#e8a050)}.pk-ck i.b10000{background:linear-gradient(135deg,#a8e8ff,#40a8d8)}
.pk-ck i.cn{width:30px;height:30px;border-radius:50%;color:#5a3a00;font-size:10px;background:radial-gradient(circle at 35% 30%,#fff3b0,#e8b830 60%,#b08010);box-shadow:inset 0 0 0 2px #a07010,0 2px 0 #705008}
.pk-ck i.c10,.pk-ck i.c25{width:25px;height:25px;background:radial-gradient(circle at 35% 30%,#fff,#d8c8a8 60%,#a89070);box-shadow:inset 0 0 0 2px #807050,0 2px 0 #605030}
.pk-ck .cash{display:flex;align-items:stretch;gap:8px}
.pk-ck .cl{display:flex;flex-direction:column;gap:3px;font-weight:800;font-size:13px;min-width:120px}
.pk-ck .cl .lbl{display:flex;align-items:center;gap:4px}
.pk-ck .cl .big{font-size:20px;color:#d63384;margin-left:4px}
.pk-ck .rcv{display:flex;gap:3px;flex-wrap:wrap}
.pk-ck .counter{flex:1;min-height:62px;border-radius:14px;background:linear-gradient(#f4e8dc,#e8d4c0);box-shadow:inset 0 2px 6px rgba(0,0,0,.18);display:flex;align-items:flex-end;justify-content:space-between;padding:4px 8px;gap:6px;position:relative}
.pk-ck .counter>b{font-size:18px;align-self:center;white-space:nowrap}
.pk-ck .counter.ok{box-shadow:inset 0 0 0 3px #3ac48a}.pk-ck .counter.ok>b{color:#2fa35a}
.pk-ck .counter.bad{box-shadow:inset 0 0 0 3px #e8336f}.pk-ck .counter.bad>b{color:#e8336f}
.pk-ck .stk{display:flex;align-items:flex-end;gap:4px;flex-wrap:wrap;min-width:0}
.pk-ck .pile{position:relative;display:flex;align-items:flex-end}
.pk-ck .pile i{margin-left:calc(-38px * min(var(--k),1));transform:rotate(calc(var(--k) * 4deg - 4deg))}
.pk-ck .pile.coins{flex-direction:column-reverse}
.pk-ck .pile.coins i{margin:0 0 -24px 0;transform:none}
.pk-ck .pile.coins i:first-child{margin-bottom:0}
.pk-ck .acts{display:flex;flex-direction:column;gap:6px;justify-content:center}
.pk-ck .acts .pk-b{padding:7px 12px}
.pk-ck .drawer{display:flex;gap:4px;justify-content:center;align-items:center;background:#3a2a30;border-radius:12px;padding:4px;flex-wrap:wrap}
.pk-ck .tray{border:0;border-radius:8px;background:#5a4048;padding:3px;position:relative;display:flex;align-items:center;justify-content:center;min-width:36px;height:38px;cursor:pointer;touch-action:manipulation}
.pk-ck .tray small{position:absolute;right:1px;bottom:-1px;font:800 10px var(--font,inherit);color:#fff;background:#d63384;border-radius:6px;padding:0 3px}
.pk-ck .tray.empty{opacity:.35}.pk-ck .tray.empty small{background:#777}
.pk-ck .nochg{padding:6px 10px;font-size:13px}
.pk-ck .pos{display:flex;align-items:center;justify-content:center;gap:14px;padding:4px}
.pk-ck .mach{width:84px;height:110px;border-radius:14px;background:linear-gradient(#4a4a58,#2a2a34);display:flex;flex-direction:column;align-items:center;padding:8px 6px;gap:6px;box-shadow:0 4px 0 #15151c}
.pk-ck .mach .scr{width:72px;height:34px;border-radius:6px;background:#bfe8c8;display:flex;align-items:center;justify-content:center;font-size:12px;color:#1f3a10}
.pk-ck .mach .keys{display:grid;grid-template-columns:repeat(3,14px);gap:4px}.pk-ck .mach .keys i{width:14px;height:9px;border-radius:3px;background:#8a8aa0}
.pk-ck .mach.ok{animation:pkBump .4s}
.pk-ck .qr{width:96px;height:96px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 3px #3ec9b4;display:flex;align-items:center;justify-content:center}
.pk-ck .qr.ok{animation:pkBump .4s}
.pk-ck .pixv{display:flex;align-items:center;gap:6px;font-size:18px}
.pk-ck .pk-b.big{padding:12px 16px;font-size:16px}
.pk-note{display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;color:#7a5a6a;background:#fff3f8;border-radius:12px;padding:6px 10px}
.pk-mg{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:min(86vw,420px)}
.pk-mg .mg-help{display:flex;align-items:center;gap:6px;font-weight:800;font-size:14px;color:#7a2a4a}
.pk-mg .mg-stage{display:flex;align-items:center;gap:12px;width:100%}
.pk-mg .rob{position:relative;width:110px;height:110px;border-radius:50%;background:radial-gradient(#fff,#ffe3ef);display:flex;align-items:center;justify-content:center;transition:transform .2s}
.pk-mg.alarm .rob .eye{position:absolute;inset:-6px;border-radius:50%;box-shadow:0 0 0 6px #e8336f;transition:box-shadow .15s}
.pk-mg.alarm .rob.away{transform:rotateY(55deg) translateX(10px)}
.pk-mg.alarm .rob.away .eye{box-shadow:0 0 0 6px #3ac48a}
.pk-mg .rob.run{animation:pkRun .7s forwards}
.pk-mg .rob.win{animation:pkBump .4s}
@keyframes pkRun{to{transform:translateX(260px) rotate(20deg);opacity:0}}
.pk-mg .bar,.pk-mg .timer{flex:1;height:14px;border-radius:7px;background:#f3d9e4;overflow:hidden}
.pk-mg .timer{max-width:90px;height:8px}
.pk-mg .bar b{display:block;height:100%;width:0;background:#3ac48a;transition:width .1s}
.pk-mg .timer b{display:block;height:100%;width:100%;background:#ff8a3a}
.pk-mg .mg-btn{font-size:20px;padding:14px 26px;touch-action:none}
.pk-office{display:flex;flex-direction:column;gap:6px;min-width:min(88vw,560px)}
.pk-office .pk-chart{width:100%;height:auto;max-height:90px;background:#fff7fb;border-radius:10px}
.pk-of-rows{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-weight:700;font-size:13px}
.pk-of-rows>div{display:flex;align-items:center;gap:5px;background:#fff3f8;border-radius:10px;padding:4px 8px}
.pk-of-rows b{margin-left:auto}
.pk-tg{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:min(90vw,560px)}
.pk-tg h2{margin:0}
.pk-tg .ask{display:flex;align-items:center;gap:8px;background:#fff3f8;border-radius:14px;padding:4px 12px;font-weight:800;font-size:15px}
.pk-tg .ask b{display:flex;align-items:center;gap:4px;color:#d63384}
.pk-tg .ask .dot{display:inline-block;width:28px;height:28px;border-radius:50%;box-shadow:inset 0 0 0 3px rgba(0,0,0,.2)}
.pk-tg .bottles{display:flex;gap:10px;justify-content:center}
.pk-tg .bt{display:flex;flex-direction:column;align-items:center;gap:3px;width:96px;padding:6px 4px;border-radius:14px;cursor:pointer;transition:transform .15s}
.pk-tg .bt.pick{background:#e4ffe9;box-shadow:inset 0 0 0 3px #3ac48a;transform:translateY(-3px)}
.pk-tg .glass{position:relative;width:44px;height:60px;border-radius:12px 12px 14px 14px;background:linear-gradient(90deg,rgba(255,255,255,.7),rgba(255,255,255,.25) 40%,rgba(255,255,255,.6));box-shadow:inset 0 0 0 2px rgba(0,0,0,.18);margin-top:12px}
.pk-tg .glass .liq{position:absolute;left:4px;right:4px;bottom:4px;height:62%;border-radius:8px 8px 10px 10px;background:var(--c);opacity:.85}
.pk-tg .glass .cap{position:absolute;left:12px;top:-12px;width:20px;height:14px;border-radius:5px;background:var(--cap);box-shadow:inset 0 0 0 2px rgba(0,0,0,.2)}
.pk-tg .bt .nm{font-size:11px;font-weight:700;line-height:1.1;text-align:center;height:24px;overflow:hidden}
.pk-tg .strip{position:relative;width:22px;height:54px;border-radius:4px;background:#fffdf8;box-shadow:0 1px 3px rgba(0,0,0,.25);display:flex;align-items:flex-start;justify-content:center;padding-top:4px}
.pk-tg .strip .fam{opacity:0;transform:scale(.4);transition:all .3s .25s}
.pk-tg .strip .mist{position:absolute;left:-14px;top:-6px;width:50px;height:40px;border-radius:50%;background:radial-gradient(rgba(255,180,215,.8),rgba(255,180,215,0) 70%);opacity:0}
.pk-tg .bt.sprayed .fam{opacity:1;transform:scale(1)}
.pk-tg .bt.sprayed .mist{animation:pkMist .9s ease-out}
@keyframes pkMist{0%{opacity:0;transform:scale(.3)}25%{opacity:1}100%{opacity:0;transform:scale(1.6) translateY(-14px)}}
.pk-tg .nwrap{display:flex;align-items:center;gap:14px}
.pk-tg .hand{width:190px;height:220px;touch-action:none}
.pk-tg .hand .nail{cursor:pointer;transition:fill .2s}
.pk-tg .pal{display:grid;grid-template-columns:repeat(4,44px);gap:8px}
.pk-tg .bot{width:44px;height:52px;border:0;border-radius:10px;background:#fff3f8;display:flex;align-items:flex-end;justify-content:center;padding:4px;cursor:pointer;touch-action:manipulation}
.pk-tg .bot i{width:24px;height:30px;border-radius:7px 7px 9px 9px;background:var(--c);box-shadow:inset 0 0 0 2px rgba(0,0,0,.2),0 -10px 0 -4px #2a2530}
.pk-tg .bot.on{box-shadow:inset 0 0 0 3px #3ac48a;background:#e4ffe9}
.pk-tg .hand .nail{stroke-width:3}
@media (max-height:400px){.pk-tg h2{font-size:18px}.pk-tg .hand{width:158px;height:183px;margin:-6px 0}.pk-tg .glass{height:48px}.pk-tg .strip{height:40px}.pk-tg .bt .nm{display:none}}
.pk-shower{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:min(86vw,380px)}
.pk-shower h2{margin:0}
.pk-shower .ask{display:flex;align-items:center;gap:6px;font-weight:800;font-size:14px}
.pk-shower .stall{position:relative;width:220px;height:200px;border-radius:16px;background:linear-gradient(#d6f0ff,#eaf8ff);overflow:hidden;touch-action:none;box-shadow:inset 0 0 0 3px #a8d8f0}
.pk-shower .stall canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.pk-shower .foam{position:absolute;inset:0;pointer-events:none;transition:opacity .2s}
.pk-shower .foam i{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#f4fbff 55%,#bfe2f6);box-shadow:inset 0 0 0 1.5px rgba(120,180,220,.6);animation:pkPop .2s}
.pk-shower .water{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s;background:repeating-linear-gradient(100deg,rgba(120,190,255,0) 0 10px,rgba(120,190,255,.45) 10px 12px);animation:pkRain .4s linear infinite}
@keyframes pkRain{from{background-position:0 0}to{background-position:-6px 40px}}
.pk-shower .meter{width:110px;height:12px;border-radius:6px;background:#f3d9e4;overflow:hidden}
.pk-shower .meter b{display:block;height:100%;width:0;background:#8fdcff;transition:width .15s}
.pk-shower .rinse{touch-action:none}
.pk-sum{grid-template-columns:repeat(3,1fr)!important;gap:4px!important}
.pk-sum .pk-stat{padding:4px 6px!important;font-size:12px}
@media (max-height:420px){.pk-shower .stall{width:180px;height:150px}.pk-shower h2{font-size:18px}}
.pk-rv{display:flex;flex-direction:column;gap:8px;text-align:left}
.pk-rv .rv-head{display:flex;gap:10px;align-items:stretch;background:#fff;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.12);overflow:hidden}
.pk-rv .rv-photo{width:180px;height:101px;object-fit:cover;flex:none;background:#eee}
.pk-rv .rv-id{display:flex;flex-direction:column;gap:2px;padding:6px 4px;min-width:0}
.pk-rv .rv-name{font-size:17px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-rv .rv-avg{display:flex;align-items:center;gap:2px;font-size:14px;color:#5f6368}.pk-rv .rv-avg>b{font-size:16px;color:#202124;margin-right:3px}
.pk-rv .rv-cat,.pk-rv .rv-next{display:flex;align-items:center;gap:4px;font-size:12px;color:#5f6368;font-weight:600}
.pk-rv .rv-s{display:inline-flex;filter:grayscale(1) opacity(.35)}.pk-rv .rv-s.on{filter:none}.pk-rv .rv-s.half{filter:grayscale(.5) opacity(.7)}
.pk-rv .rv-dist{display:flex;flex-direction:column;gap:2px;padding:0 6px}
.pk-rv .rv-dist>div{display:flex;align-items:center;gap:6px;font-size:11px;color:#5f6368;font-weight:700}
.pk-rv .rv-dist i{flex:1;height:7px;border-radius:4px;background:#e8eaed;overflow:hidden}.pk-rv .rv-dist b{display:block;height:100%;background:#fbbc04}
.pk-rv .rv-it{display:flex;gap:8px;padding:6px 4px;border-top:1px solid #f0e0e8}
.pk-rv .rv-it img{width:36px;height:36px;border-radius:50%;flex:none}
.pk-rv .rv-who{display:flex;gap:8px;align-items:baseline;font-size:13px;color:#202124}.pk-rv .rv-who small{color:#5f6368}
.pk-rv .rv-tx{font-size:13px;color:#3c4043;font-weight:600}
.pk-ck .chg{font-weight:800;font-size:15px;display:flex;gap:10px;align-items:center;justify-content:center}
.pk-ck .chg b{font-size:18px}
.pk-ck .chg .ok{color:#2fa35a}
.pk-ck .chg .bad{color:#e8336f}
`;
let done = false;
export function injectCss(): void {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'pk-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}
