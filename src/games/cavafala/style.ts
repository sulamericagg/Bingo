/* CSS do Cava & Fala (injetado uma vez). */
const CSS = `
.cf-root{position:absolute;inset:0;overflow:hidden;background:#1a1030;font-family:var(--font,'Fredoka',system-ui,sans-serif);user-select:none;-webkit-user-select:none;touch-action:none}
.cf-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cf-hud{position:absolute;inset:0;pointer-events:none;z-index:10;color:#fff}
.cf-hud.hidden>*:not(.cf-panel){display:none}
.cf-hud button{pointer-events:auto;font-family:inherit}
.cf-top{position:absolute;left:var(--edge-l,10px);top:calc(env(safe-area-inset-top,0px) + 8px);display:flex;align-items:flex-start;gap:6px;max-width:calc(50% - 30px - var(--edge-l,10px))}
.cf-ib{width:40px;height:40px;min-width:40px!important;min-height:40px!important;border-radius:12px;border:0;background:rgba(20,8,48,.55);display:grid;place-items:center;padding:0}
.cf-ib svg{width:24px;height:24px}
.cf-mats{display:flex;gap:3px 4px;flex-wrap:wrap}
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
.cf-wave{display:flex;gap:3px;align-items:center;height:22px}
.cf-wave i{width:4px;height:8px;border-radius:2px;background:#ff4fa3;animation:cfwave .5s ease-in-out infinite alternate}
.cf-wave i:nth-child(2){animation-delay:.1s}.cf-wave i:nth-child(3){animation-delay:.2s}.cf-wave i:nth-child(4){animation-delay:.3s}.cf-wave i:nth-child(5){animation-delay:.15s}
@keyframes cfwave{to{height:22px}}
.cf-b{position:absolute;border:0;border-radius:50%;display:grid;place-items:center;padding:0;box-shadow:0 4px 0 rgba(0,0,0,.28),inset 0 -4px 0 rgba(0,0,0,.18),inset 0 0 0 3px rgba(255,255,255,.35);background:rgba(90,70,160,.72)}
.cf-b svg{width:54%;height:54%;margin-top:-6px}
.cf-b small{position:absolute;bottom:7px;left:0;right:0;font:800 9.5px/1 inherit;color:#fff;letter-spacing:.4px;text-align:center;text-shadow:0 1px 0 rgba(0,0,0,.4)}
.cf-dig{right:calc(var(--edge-r,10px) + 6px);bottom:calc(var(--edge-b,10px) + 8px);width:80px;height:80px;background:radial-gradient(circle at 35% 30%,#ffb35a,#e8742a)}
.cf-use{right:calc(var(--edge-r,10px) + 96px);bottom:calc(var(--edge-b,10px) + 4px);width:64px;height:64px;background:radial-gradient(circle at 35% 30%,#7ab8ff,#3a6ad8)}
.cf-use.off{filter:saturate(.3) brightness(.85)}
.cf-jump{right:calc(var(--edge-r,10px) + 12px);bottom:calc(var(--edge-b,10px) + 100px);width:62px;height:62px}
.cf-jump svg{margin-top:0}
.cf-mic{right:calc(var(--edge-r,10px) + 90px);bottom:calc(var(--edge-b,10px) + 80px);width:72px;height:72px;background:radial-gradient(circle at 35% 30%,#ff8fd8,#d8329a)}
.cf-mic.rec{animation:cfrec .5s ease-in-out infinite alternate;box-shadow:0 0 0 6px rgba(255,79,163,.35),0 0 24px #ff4fa3}
@keyframes cfrec{to{transform:scale(1.1)}}
.cf-sm{width:46px!important;height:46px!important;min-width:46px!important;min-height:46px!important;background:rgba(20,8,48,.6)}
.cf-sm svg{margin-top:0;width:62%;height:62%}
.cf-kb{right:calc(var(--edge-r,10px) + 172px);bottom:calc(var(--edge-b,10px) + 12px)}
.cf-book{right:calc(var(--edge-r,10px) + 172px);bottom:calc(var(--edge-b,10px) + 66px)}
.cf-hot{position:absolute;right:calc(var(--edge-r,10px) + 226px);bottom:calc(var(--edge-b,10px) + 6px);display:flex;gap:5px}
.cf-slot{position:relative;width:46px;height:46px;min-width:46px!important;min-height:46px!important;border-radius:12px;border:0;padding:0;background:rgba(20,8,48,.55);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
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
@media (max-height:420px){.cf-title{font-size:26px}.cf-sub{font-size:12px}.cf-mode small{font-size:11px}}
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
