/* CSS do Cava & Fala (injetado uma vez). */
const CSS = `
.cf-root{position:absolute;inset:0;overflow:hidden;background:#1a1030;font-family:var(--font,'Fredoka',system-ui,sans-serif);user-select:none;-webkit-user-select:none;touch-action:none}
.cf-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cf-hud{position:absolute;inset:0;pointer-events:none;z-index:10;color:#fff;--cfb:max(var(--edge-b,10px),var(--safe-bot,env(safe-area-inset-bottom,0px)));--cfr:var(--edge-r,10px)}
.cf-hud.hidden>*:not(.cf-panel){display:none}
.cf-hud button{pointer-events:auto;font-family:inherit}
.cf-top{position:absolute;left:var(--edge-l,10px);top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;align-items:flex-start;gap:6px;max-width:calc(50% - 30px - var(--edge-l,10px))}
.cf-ib{width:40px;height:40px;min-width:40px!important;min-height:40px!important;border-radius:12px;border:0;background:rgba(20,8,48,.55);display:grid;place-items:center;padding:0}
.cf-ib svg{width:24px;height:24px}
.cf-mats{display:none;gap:3px 4px;flex-wrap:wrap;max-width:240px;padding:4px;border-radius:14px;background:rgba(20,8,48,.6)}
.cf-mats.open{display:flex}
.cf-bag{display:flex;align-items:center;gap:4px;height:40px;min-height:40px!important;padding:0 10px 0 6px;border:0;border-radius:12px;background:rgba(20,8,48,.55);color:#fff;font:800 14px/1 inherit}
.cf-bag svg{width:26px;height:26px}
.cf-bag.pop{animation:cfpop .35s ease-out}
.cf-mat{display:flex;align-items:center;gap:2px;padding:3px 6px 3px 3px;border-radius:999px;background:rgba(20,8,48,.55);font:700 12px/1 inherit;min-width:32px;transition:opacity .2s}
.cf-mat i{width:13px;height:13px;border-radius:4px;background:var(--c);box-shadow:inset 0 -2px 0 rgba(0,0,0,.25),0 0 0 1.5px rgba(255,255,255,.5);transform:rotate(45deg) scale(.85)}
.cf-mat.z{opacity:.45}
.cf-mat.pop{animation:cfpop .35s ease-out}
@keyframes cfpop{40%{transform:scale(1.28);background:rgba(255,211,74,.55)}}
.cf-status{position:absolute;right:var(--edge-r,10px);top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;gap:4px;align-items:center;font:700 12px/1 inherit;max-width:calc(50% - 30px - var(--edge-r,10px));justify-content:flex-end;flex-wrap:wrap}
.cf-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border-radius:999px;background:rgba(20,8,48,.6);white-space:nowrap}
.cf-chip.warn{background:rgba(200,60,40,.75)}
.cf-chip i{width:12px;height:12px;border-radius:50%;background:var(--c);display:inline-block;box-shadow:0 0 0 1.5px #fff}
.cf-chip.out{opacity:.4;text-decoration:line-through}
.cf-chip.me{box-shadow:inset 0 0 0 2px #ffd34a}
.cf-cross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2.5px solid rgba(255,255,255,.75);box-shadow:0 0 0 1px rgba(0,0,0,.25);transition:transform .1s,border-color .1s}
.cf-cross i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#fff}
.cf-cross.dig{border-color:#ffd34a;transform:scale(1.15)}
.cf-cross.far{opacity:.45}
.cf-cross.aim{border-color:#ff8fd8}
.cf-prog{position:absolute;left:50%;top:calc(50% + 26px);transform:translateX(-50%);width:180px;height:18px;border-radius:9px;background:rgba(20,8,48,.6);overflow:hidden;opacity:0;transition:opacity .2s}
.cf-prog.on{opacity:1}
.cf-prog b{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#3ee07a,#ffd34a);transition:width .3s}
.cf-prog span{position:relative;display:block;text-align:center;font:700 11px/18px inherit;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.cf-gains{position:absolute;left:50%;top:calc(50% - 44px);display:flex;flex-direction:column;align-items:center;transform:translateX(-50%)}
.cf-gain{font:800 15px/1.2 inherit;color:var(--c);text-shadow:0 2px 0 #2a0b5c,0 0 3px #2a0b5c;animation:cfgain 1.1s ease-out forwards;white-space:nowrap}
@keyframes cfgain{0%{transform:translateY(8px) scale(.7);opacity:0}15%{transform:none;opacity:1}100%{transform:translateY(-34px);opacity:0}}
.cf-arrow{position:absolute;left:0;top:0;width:44px;height:44px;opacity:0;transition:opacity .2s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
.cf-arrow.on{opacity:1}
.cf-arrow.bob svg{animation:cfbob .6s ease-in-out infinite alternate}
@keyframes cfbob{to{transform:translateY(-10px)}}
.cf-listen{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 56px);transform:translate(-50%,-10px);display:flex;align-items:center;gap:10px;max-width:70vw;padding:8px 16px 8px 12px;border-radius:18px;background:#fff;color:#2a0b5c;font:700 15px/1.25 inherit;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:0;transition:opacity .15s,transform .15s}
.cf-listen.on{opacity:1;transform:translate(-50%,0)}
.cf-listen span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-wave{display:flex;gap:3px;align-items:center;height:30px}
.cf-wave i{width:5px;height:4px;border-radius:3px;background:linear-gradient(#ff8fd8,#ff4fa3);transition:height .06s linear}
.cf-heard{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 56px);transform:translate(-50%,-8px);display:flex;align-items:center;gap:8px;max-width:72vw;padding:7px 14px 7px 8px;border-radius:18px;background:#fff;color:#2a0b5c;font:700 15px/1.25 inherit;box-shadow:0 4px 16px rgba(0,0,0,.35);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
.cf-heard.on{opacity:1;transform:translate(-50%,0)}
.cf-heard svg{flex:none;width:26px;height:26px}
.cf-heard span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-heard.ok b{color:#1f8a46}.cf-heard.no{box-shadow:0 0 0 3px #ff8a3a,0 4px 16px rgba(0,0,0,.35)}
.cf-b{position:absolute;border:0;border-radius:50%;display:grid;place-items:center;padding:0;box-shadow:0 4px 0 rgba(0,0,0,.28),inset 0 -4px 0 rgba(0,0,0,.18),inset 0 0 0 3px rgba(255,255,255,.35);background:rgba(90,70,160,.72)}
.cf-b svg{width:54%;height:54%;margin-top:-6px}
.cf-b small{position:absolute;bottom:7px;left:0;right:0;font:800 9.5px/1 inherit;color:#fff;letter-spacing:.4px;text-align:center;text-shadow:0 1px 0 rgba(0,0,0,.4)}
.cf-dig{right:calc(var(--cfr) + 6px);bottom:calc(var(--cfb) + 6px);width:82px;height:82px;background:radial-gradient(circle at 35% 30%,#ffb35a,#e8742a)}
.cf-use{right:calc(var(--cfr) + 100px);bottom:calc(var(--cfb) + 4px);width:62px;height:62px;background:radial-gradient(circle at 35% 30%,#7ab8ff,#3a6ad8)}
.cf-use.off{filter:saturate(.3) brightness(.85)}
.cf-jump{right:calc(var(--cfr) + 16px);bottom:calc(var(--cfb) + 102px);width:60px;height:60px}
.cf-jump svg{margin-top:0}
.cf-mic{right:calc(var(--cfr) + 94px);bottom:calc(var(--cfb) + 80px);width:76px;height:76px;background:radial-gradient(circle at 35% 30%,#ff8fd8,#d8329a)}
.cf-mic.rec{animation:cfrec .5s ease-in-out infinite alternate;box-shadow:0 0 0 6px rgba(255,79,163,.35),0 0 24px #ff4fa3}
@keyframes cfrec{to{transform:scale(1.1)}}
.cf-sm{width:46px!important;height:46px!important;min-width:46px!important;min-height:46px!important;background:rgba(20,8,48,.6)}
.cf-sm svg{margin-top:0;width:62%;height:62%}
.cf-hot{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--cfb) + 4px);display:flex;gap:4px;padding:3px;border-radius:14px;background:rgba(20,8,48,.35)}
.cf-slot{position:relative;width:44px;height:44px;min-width:44px!important;min-height:44px!important;border-radius:11px;border:0;padding:0;background:rgba(20,8,48,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
.cf-slot.on{background:rgba(255,211,74,.35);box-shadow:inset 0 0 0 3px #ffd34a;transform:translateY(-4px)}
.cf-slot img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.cf-slot em{position:absolute;right:2px;top:1px;font:800 11px/1 inherit;font-style:normal;color:#fff;text-shadow:0 1px 2px #000}
.cf-slot kbd{position:absolute;left:3px;bottom:1px;font:700 9px/1 inherit;opacity:.6}
.cf-panel{position:absolute;inset:0;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(16,6,40,.55);z-index:30;padding:calc(env(safe-area-inset-top,0px) + 8px) var(--edge-r,12px) 8px var(--edge-l,12px)}
.cf-card{background:#fff;color:#2a0b5c;border-radius:22px;padding:14px 16px;max-width:min(560px,94vw);max-height:92%;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.4);touch-action:pan-y}
.cf-card h2{margin:0 0 8px;font:800 20px/1.1 inherit}
.cf-card p{margin:4px 0;font:600 13.5px/1.35 inherit;opacity:.85}
.cf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;margin-top:10px}
.cf-btn{border:0;border-radius:14px;padding:10px 16px;font:800 15px/1 inherit;color:#fff;background:#7b3cff;box-shadow:0 3px 0 rgba(0,0,0,.25);cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:44px}
.cf-btn.g{background:#2fb35a}.cf-btn.o{background:#ff8a3a}.cf-btn.p{background:#ff4fa3}.cf-btn.w{background:#efe8ff;color:#2a0b5c}
.cf-input{display:flex;gap:8px;align-items:center}
.cf-input input{flex:1;min-width:0;font:700 18px/1.2 inherit;padding:10px 12px;border-radius:12px;border:2.5px solid #7b3cff;color:#2a0b5c;outline:none}
.cf-sugs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cf-sug{border:0;border-radius:999px;padding:6px 11px;font:700 13px/1 inherit;background:#efe8ff;color:#2a0b5c;cursor:pointer;min-height:32px}
.cf-preview{margin-top:8px;min-height:22px;font:700 13px/1.4 inherit}
.cf-cost{display:inline-flex;align-items:center;gap:3px;margin:2px 6px 2px 0;font:700 12.5px/1 inherit;color:#1f7a3a}
.cf-cost.no{color:#d8323f}
.cf-cost i{width:11px;height:11px;border-radius:3px;background:var(--c);transform:rotate(45deg) scale(.85);box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.cf-ring{position:relative;width:min(84vh,360px);height:min(84vh,360px)}
.cf-ring .cf-rc{position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px;border-radius:50%;background:#fff;color:#2a0b5c;display:grid;place-items:center;text-align:center;font:800 12px/1.15 inherit;box-shadow:0 4px 14px rgba(0,0,0,.35);padding:6px}
.cf-ring .cf-ri{position:absolute;width:66px;height:66px;margin:-33px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 0 rgba(0,0,0,.25),inset 0 0 0 3px #c8b8ff;padding:0;cursor:pointer;transition:transform .1s}
.cf-ring .cf-ri img{width:100%;height:100%;border-radius:50%}
.cf-ring .cf-ri.no{filter:grayscale(.8) brightness(.9)}
.cf-ring .cf-ri b{position:absolute;left:50%;bottom:-14px;transform:translateX(-50%);white-space:nowrap;font:800 10.5px/1 inherit;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000}
.cf-ring .cf-ri.on{transform:scale(1.12);box-shadow:0 3px 0 rgba(0,0,0,.25),inset 0 0 0 3px #ffd34a}
.cf-menu{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) var(--edge-r,14px) 10px var(--edge-l,14px);background:radial-gradient(ellipse at 50% 120%,#8a5a3a 0,#4a2a6a 45%,#1a1030 100%);color:#fff;overflow:auto}
.cf-title{font:800 34px/1 inherit;letter-spacing:1px;background:linear-gradient(#fff6c0,#ffb84a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 0 #2a0b5c);text-align:center}
.cf-sub{font:600 13px/1.3 inherit;opacity:.85;text-align:center;max-width:560px}
.cf-modes{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.cf-mode{position:relative;width:min(270px,44vw);border:0;border-radius:18px;padding:10px 12px;text-align:left;color:#fff;background:linear-gradient(160deg,var(--a),var(--b));box-shadow:0 5px 0 rgba(0,0,0,.3),inset 0 0 0 3px rgba(255,255,255,.25);cursor:pointer;min-height:84px}
.cf-mode b{display:block;font:800 18px/1.1 inherit}
.cf-mode small{display:block;font:600 12px/1.3 inherit;opacity:.92;margin-top:4px}
.cf-mode .cf-star{position:absolute;right:10px;top:8px;font:800 13px inherit;color:#ffd34a}
.cf-towns{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center}
.cf-lab{font:700 13px inherit;opacity:.85}
.cf-town{border:0;border-radius:14px;padding:6px 10px;max-width:170px;color:#fff;text-align:left;background:linear-gradient(160deg,var(--a),var(--b));box-shadow:0 3px 0 rgba(0,0,0,.3);cursor:pointer;min-height:44px}
.cf-town b{display:block;font:800 12.5px/1.1 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-town small{display:block;font:700 10.5px/1.2 inherit;opacity:.9;margin-top:2px}
.cf-st{color:#ffd34a;letter-spacing:1px}
.cf-tdesc{font:600 12px/1.2 inherit;opacity:.8;text-align:center;margin-top:-3px}
.cf-town.on{box-shadow:0 4px 0 rgba(0,0,0,.3),inset 0 0 0 3px #ffd34a}
.cf-seg{display:inline-flex;background:rgba(255,255,255,.15);border-radius:12px;padding:3px;gap:3px}
.cf-seg button{border:0;border-radius:9px;padding:7px 12px;font:700 13px/1 inherit;background:transparent;color:#fff;cursor:pointer;min-height:36px}
.cf-seg button.on{background:#ffd34a;color:#2a0b5c}
.cf-opts{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;font:700 13px inherit}
.cf-loading{position:absolute;inset:0;z-index:35;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:#1a1030;color:#fff;font:700 16px inherit}
.cf-loading .bar{width:220px;height:12px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden}
.cf-loading .bar b{display:block;height:100%;background:linear-gradient(90deg,#ffd34a,#ff8a3a);width:0;transition:width .15s}
.cf-stars{font:800 30px/1 inherit;color:#ffd34a;letter-spacing:4px;text-shadow:0 3px 0 #2a0b5c;text-align:center}
.cf-res{display:grid;grid-template-columns:auto auto;gap:4px 14px;font:700 14px/1.3 inherit;justify-content:center}
.cf-chip.sm{padding:5px 7px;gap:3px}
.cf-choose{width:min(560px,94vw);text-align:center}
.cf-choose h2 q{color:#d8329a}
.cf-opts3{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.cf-opt{width:150px;border:0;border-radius:18px;padding:8px;background:#f3eeff;box-shadow:0 4px 0 #c8b8ff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;color:#2a0b5c}
.cf-opt img{width:72px;height:72px}
.cf-opt b{font:800 15px/1.1 inherit}
.cf-opt span{font-size:11px;line-height:1.2}
.cf-opt:active{transform:translateY(3px);box-shadow:0 1px 0 #c8b8ff}
.cf-btn svg{width:22px;height:22px}
.cf-perm{text-align:center;max-width:min(460px,92vw)}
.cf-permic{width:72px;height:72px;margin:0 auto 6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff8fd8,#d8329a);display:grid;place-items:center;box-shadow:0 0 0 6px rgba(255,79,163,.25);animation:cfrec .7s ease-in-out infinite alternate}
.cf-permic svg{width:42px;height:42px}
.cf-permic.off{filter:grayscale(1);animation:none}
.cf-mic.live{animation:cflive 1.1s ease-in-out infinite;box-shadow:0 0 0 5px #fff,0 0 0 11px rgba(255,79,163,.55),0 0 30px #ff4fa3}
.cf-mic.wait{opacity:.8}
@keyframes cflive{50%{box-shadow:0 0 0 5px #fff,0 0 0 16px rgba(255,79,163,.25),0 0 40px #ff4fa3}}
.cf-listen.off{background:#3a2a5a;color:#fff}
.cf-listen.off .cf-wave{display:none}
.cf-subt{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 104px);transform:translateX(-50%);max-width:min(560px,64vw);padding:7px 14px;border-radius:14px;background:rgba(10,4,30,.78);color:#fff;font:700 16px/1.3 inherit;text-align:center;opacity:0;transition:opacity .15s;pointer-events:none}
.cf-subt.on{opacity:1}
.cf-subt b{color:#ff8fd8}
.cf-subt em{font-style:normal;color:#ffd34a}
.cf-subt.ok{background:rgba(20,110,60,.88)}.cf-subt.ok em{color:#d8ffd0}
.cf-subt.no{background:rgba(120,50,20,.88)}
.cf-subt.hint{background:rgba(42,11,92,.88);color:#ffe6a0}
.cf-subt-sug{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.cf-subt-sug:empty{display:none}
.cf-subt-sug button{pointer-events:auto;margin-top:5px;border:0;border-radius:999px;padding:6px 12px;font:800 13px/1 inherit;background:#fff;color:#2a0b5c;min-height:34px}
.cf-seg2{background:#efe8ff}.cf-seg2 button{color:#2a0b5c}
.cf-mt{width:min(480px,92vw);text-align:center}
.cf-mt .cf-mtbars{display:flex;gap:4px;align-items:flex-end;justify-content:center;height:70px;margin:8px 0}
.cf-mt .cf-mtbars i{width:10px;height:4px;border-radius:4px;background:linear-gradient(#ff8fd8,#7b3cff);transition:height .06s}
.cf-mt .cf-mtlog{min-height:44px;max-height:96px;overflow:auto;padding:8px;border-radius:12px;background:#f3eeff;font:700 14px/1.35 inherit;text-align:left}
.cf-mt .cf-mtlog i{opacity:.55;font-style:normal}
@media (max-height:420px){.cf-mt .cf-mtbars{height:48px}.cf-opt{width:132px;padding:6px}.cf-opt img{width:56px;height:56px}.cf-permic{width:56px;height:56px}.cf-permic svg{width:32px;height:32px}.cf-choose h2,.cf-perm h2{font-size:17px}.cf-title{font-size:26px}.cf-sub{font-size:12px}.cf-mode small{font-size:11px}}
/* objeto falado: pílula "Criando…", cartão Refazer/Guardar, Montar, galeria */
.cf-make{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 100px);transform:translate(-50%,-10px) scale(.96);display:flex;align-items:center;gap:8px;padding:8px 14px 8px 10px;border-radius:20px;background:linear-gradient(135deg,#7b3cff,#ff4fa3);color:#fff;font:800 15px/1.1 inherit;box-shadow:0 6px 22px rgba(80,0,120,.45);opacity:0;transition:opacity .2s,transform .25s;pointer-events:none;max-width:82vw;white-space:nowrap}
.cf-make.on{opacity:1;transform:translate(-50%,0) scale(1)}
.cf-make em{font-style:normal;font-weight:700;opacity:.92;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
.cf-make i{display:block;width:70px;height:8px;border-radius:6px;background:rgba(255,255,255,.3);overflow:hidden;flex:none}
.cf-make u{display:block;height:100%;width:0;background:#ffd34a;border-radius:6px;transition:width .1s}
.cf-make .cf-mk-s{font-size:20px;animation:cfspin 1.2s linear infinite}
.cf-make.magic{background:linear-gradient(135deg,#2fb3ff,#9a5aff,#ff4fa3);background-size:200% 200%;animation:cfmagic 1.4s ease-in-out infinite}
.cf-make.magic i u{width:100%!important;background:repeating-linear-gradient(90deg,#ffd34a 0 10px,#fff6c0 10px 20px);animation:cfbar .6s linear infinite}
@keyframes cfspin{to{transform:rotate(360deg)}}
@keyframes cfmagic{50%{background-position:100% 50%}}
@keyframes cfbar{to{background-position:20px 0}}
.cf-mcard{position:absolute;left:50%;bottom:calc(var(--cfb) + 8px);transform:translate(-50%,20px);display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;border-radius:18px;background:rgba(255,255,255,.96);color:#2a0b5c;box-shadow:0 6px 22px rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .2s,transform .25s;max-width:min(560px,64vw);z-index:3}
.cf-mcard.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.cf-mc-t{display:flex;flex-direction:column;min-width:0;gap:1px}
.cf-mc-t b{font:800 15px/1.15 inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-mc-t small{font:600 12px/1.2 inherit;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-mc-t em{font:700 11px/1 inherit;font-style:normal;color:#7b3cff}
.cf-mc-b{display:flex;gap:6px;flex:none}
.cf-mc-b .cf-btn{min-height:38px;padding:8px 12px;font-size:14px}
.cf-mc-b .cf-btn[disabled]{opacity:.55}
.cf-mount{position:absolute;right:calc(var(--cfr) + 96px);bottom:calc(var(--cfb) + 150px);min-height:48px;padding:0 18px;border:0;border-radius:24px;background:#ffd34a;color:#2a0b5c;font:800 16px/1 inherit;box-shadow:0 4px 0 rgba(0,0,0,.25),0 0 0 3px #fff;opacity:0;transform:scale(.8);transition:opacity .15s,transform .15s;pointer-events:none!important}
.cf-mount.on{opacity:1;transform:scale(1);pointer-events:auto!important}
.cf-gal{width:min(640px,94vw);max-height:86vh;display:flex;flex-direction:column}
.cf-galg{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;overflow:auto;padding:4px;margin:6px 0}
.cf-gi{position:relative}
.cf-gb{width:100%;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:0;border-radius:14px;background:#efe8ff;color:#2a0b5c;cursor:pointer}
.cf-gb img{width:72px;height:72px}
.cf-gb b{font:800 12px/1.15 inherit;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cf-gb span{display:flex;flex-wrap:wrap;justify-content:center}
.cf-gx{position:absolute;right:2px;top:2px;width:26px;height:26px;min-height:26px!important;border:0;border-radius:50%;background:#ff4f6a;color:#fff;font:800 16px/1 inherit}
`;
let done = false;
export function injectCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.id = 'cf-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
