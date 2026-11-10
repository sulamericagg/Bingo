/* CSS próprio da Cozinha Maluca (injetado uma vez; prefixo .cz-). */
const CSS = `
.cz-root{position:absolute;inset:0;overflow:hidden;background:#ff8a7a;font-family:var(--font,Fredoka,system-ui,sans-serif);color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;z-index:50}
.cz-root canvas.cz-cv{position:absolute;left:0;top:0;display:block;touch-action:none}
.cz-hud{position:absolute;inset:0;pointer-events:none}
.cz-fpsmode .cz-acts,.cz-fpsmode .cz-joy{display:none!important}
.cz-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 6px) 8px 0}
.cz-btn{pointer-events:auto;border:0;cursor:pointer;font:inherit;color:#fff;background:linear-gradient(#8a5cff,#5326cc);box-shadow:0 3px 0 #2a0b5c,inset 0 2px 0 rgba(255,255,255,.35);border-radius:14px;padding:7px 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:16px}
.cz-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #2a0b5c}
.cz-btn.cz-ic{width:42px;height:42px;padding:0}
.cz-btn.cz-gold{background:linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00);color:#2a0b5c}
.cz-btn.cz-green{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.cz-btn.cz-pink{background:linear-gradient(#ffc7ee,#ff5cc8 50%,#c9268a)}
.cz-btn.cz-orange{background:linear-gradient(#ffe680,#ff9a2e 55%,#e0501f)}
.cz-btn[disabled]{filter:grayscale(.8) brightness(.8);pointer-events:none}
.cz-pill{background:rgba(42,11,92,.82);border:2px solid rgba(255,255,255,.18);border-radius:999px;padding:3px 12px 3px 6px;display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:17px;white-space:nowrap}
.cz-pill.cz-hurry{background:#c21d3c;animation:czPulse .5s infinite alternate}
@keyframes czPulse{to{transform:scale(1.08)}}
.cz-sp{flex:1}
.cz-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:rgba(42,11,92,.25);border:3px solid rgba(255,255,255,.45);pointer-events:none}
.cz-joy i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.85);border:3px solid #2a0b5c}
.cz-acts{position:absolute;right:calc(env(safe-area-inset-right,0px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + 18px);display:flex;align-items:flex-end;gap:12px;pointer-events:none}
.cz-act{pointer-events:auto;border-radius:50%;border:4px solid #2a0b5c;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit;font-weight:700;color:#2a0b5c;box-shadow:0 5px 0 #2a0b5c,inset 0 3px 0 rgba(255,255,255,.6);touch-action:none;gap:0;line-height:1}
.cz-act small{font-size:12px;margin-top:2px}
.cz-act.cz-down{transform:translateY(4px);box-shadow:0 1px 0 #2a0b5c}
.cz-pick{width:78px;height:78px;background:radial-gradient(circle at 40% 30%,#fff6b0,#ffcf2e 60%,#e98f00)}
.cz-do{width:104px;height:104px;background:radial-gradient(circle at 40% 30%,#c9ffdc,#3ee07a 60%,#17994a)}
.cz-do.cz-off{filter:grayscale(.7) brightness(.85)}
.cz-emo{position:absolute;right:calc(env(safe-area-inset-right,0px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + 136px)}
.cz-banner{position:absolute;left:0;right:0;top:40%;text-align:center;font-size:40px;font-weight:700;color:#fff36b;-webkit-text-stroke:4px #2a0b5c;paint-order:stroke fill;text-shadow:0 4px 0 #2a0b5c;pointer-events:none;animation:czPop .5s cubic-bezier(.3,1.6,.6,1);padding:0 12px}
.cz-banner small{display:block;font-size:20px;-webkit-text-stroke:3px #2a0b5c;color:#fff}
@keyframes czPop{from{transform:scale(.3);opacity:0}}
.cz-ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 16px) 14px calc(env(safe-area-inset-bottom,0px) + 16px);pointer-events:auto;overflow-y:auto;animation:czFade .25s;background:radial-gradient(circle at 50% 20%,rgba(255,170,90,.35),rgba(30,10,60,.94) 70%)}
.cz-ov.cz-center{justify-content:center}
@keyframes czFade{from{opacity:0}}
.cz-title{font-size:34px;font-weight:700;color:#fff36b;-webkit-text-stroke:3px #2a0b5c;paint-order:stroke fill;text-shadow:0 3px 0 #2a0b5c;text-align:center;line-height:1.05}
.cz-sub{font-size:15px;opacity:.92;text-align:center;max-width:360px;line-height:1.25}
.cz-card{width:min(380px,94vw);background:linear-gradient(#3b2a7a,#2a1a60);border:3px solid #2a0b5c;border-radius:20px;padding:12px;box-shadow:0 6px 0 #150533;display:flex;flex-direction:column;gap:8px}
.cz-big{font-size:21px;padding:12px 16px;border-radius:18px;width:100%}
.cz-modes{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
.cz-mode{pointer-events:auto;cursor:pointer;width:min(170px,42vw);border-radius:22px;border:4px solid #2a0b5c;box-shadow:0 6px 0 #2a0b5c;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;font:inherit;color:#2a0b5c;background:linear-gradient(#fffaf0,#ffe1b8)}
.cz-mode b{font-size:44px;line-height:1;-webkit-text-stroke:2px #2a0b5c;paint-order:stroke fill;color:#ff7a2e}
.cz-mode.cz-3d{background:linear-gradient(#efe6ff,#c9b3ff)}
.cz-mode.cz-3d b{color:#8a5cff}
.cz-mode span{font-weight:700;font-size:15px}
.cz-mode small{font-size:12px;opacity:.8;text-align:center;line-height:1.2}
.cz-mode.cz-last{outline:4px solid #ffe14a;outline-offset:3px}
.cz-row{display:flex;align-items:center;gap:8px}
.cz-row .cz-grow{flex:1;min-width:0}
.cz-crew{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
.cz-slot{width:62px;border-radius:14px;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.2);display:flex;flex-direction:column;align-items:center;padding:4px 2px;font-size:11px;font-weight:600;text-align:center;line-height:1.1;cursor:pointer;pointer-events:auto}
.cz-slot.cz-on{background:rgba(62,224,122,.3);border-color:#3ee07a}
.cz-slot canvas{width:44px;height:55px}
.cz-tabs{display:flex;gap:6px;width:min(380px,94vw)}
.cz-tabs .cz-btn{flex:1;font-size:14px;padding:8px 4px;background:linear-gradient(#5d4a9e,#3b2a7a)}
.cz-tabs .cz-btn.cz-on{background:linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00);color:#2a0b5c}
.cz-item{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.08);border-radius:14px;padding:8px}
.cz-item .cz-grow{flex:1;min-width:0}
.cz-item .cz-grow b{display:block;font-size:16px}
.cz-item .cz-grow small{display:block;font-size:12px;opacity:.85;line-height:1.2}
.cz-lv{display:flex;gap:3px;margin-top:3px}
.cz-lv i{width:12px;height:6px;border-radius:3px;background:rgba(255,255,255,.2)}
.cz-lv i.on{background:#3ee07a}
.cz-stars{display:flex;gap:6px;justify-content:center}
.cz-stars span{animation:czPop .5s both}
.cz-stat{display:flex;justify-content:space-between;font-size:16px;font-weight:600;padding:2px 4px}
.cz-input{font:inherit;font-size:18px;width:100%;padding:8px 10px;border-radius:12px;border:3px solid #2a0b5c;text-align:center;letter-spacing:4px;pointer-events:auto}
.cz-note{font-size:12px;opacity:.8;text-align:center}
.cz-pause{position:absolute;inset:0;background:rgba(20,8,50,.7);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;pointer-events:auto}
.cz-menu-list{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.cz-menu-list span{background:rgba(255,255,255,.12);border-radius:10px;padding:3px 8px;font-size:13px}

.cz-toasts{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 54px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:8;max-width:70vw}
.cz-toast{background:rgba(42,11,92,.9);border:2px solid rgba(255,255,255,.35);border-radius:12px;padding:3px 12px;font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70vw;animation:czToastIn .25s cubic-bezier(.3,1.5,.6,1);transition:opacity .25s,transform .25s}
.cz-toast small{font-size:12px;opacity:.85;font-weight:600}
.cz-toast.cz-out{opacity:0;transform:translateY(-8px)}
@keyframes czToastIn{from{opacity:0;transform:translateY(-10px) scale(.9)}}
.cz-tip{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 9px);transform:translateX(-50%);max-width:min(40vw,360px);display:flex;align-items:center;gap:6px;background:#fffbe8;color:#2a0b5c;border:2px solid #2a0b5c;border-radius:12px;padding:3px 4px 3px 10px;font-size:13px;font-weight:700;line-height:1.15;box-shadow:0 3px 0 #2a0b5c66;pointer-events:none;z-index:7}
.cz-tip span{flex:1;min-width:0}
.cz-tip.cz-pop{animation:czTipPop .35s cubic-bezier(.3,1.6,.6,1)}
@keyframes czTipPop{from{transform:translateX(-50%) scale(.85)}}
.cz-skip{pointer-events:auto;border:0;border-radius:9px;background:#2a0b5c;color:#fff;font:inherit;font-size:11px;font-weight:700;padding:4px 8px;cursor:pointer;opacity:.75}
@media (orientation:portrait){.cz-tip{top:calc(env(safe-area-inset-top,0px) + 132px);max-width:92vw}.cz-toasts{top:calc(env(safe-area-inset-top,0px) + 168px)}}
.cz-pets{position:absolute;left:calc(env(safe-area-inset-left,0px) + 6px);top:calc(env(safe-area-inset-top,0px) + 128px);display:flex;flex-direction:column;gap:6px;pointer-events:none;z-index:6}
.cz-chip{pointer-events:auto;position:relative;width:46px;height:50px;border-radius:14px;border:3px solid #2a0b5c;background:linear-gradient(#fff6e0,#ffd9a0);box-shadow:0 3px 0 #2a0b5c;padding:0;cursor:pointer;touch-action:manipulation}
.cz-chip .cz-chipface{width:36px;height:45px;position:absolute;left:2px;bottom:0}
.cz-chip i{position:absolute;right:-10px;top:-8px;width:26px;height:26px}
.cz-chip i canvas{width:26px;height:26px}
.cz-chip.cz-busy{background:linear-gradient(#e0ffe8,#8ff0b0)}
.cz-chip:active{transform:translateY(2px);box-shadow:0 1px 0 #2a0b5c}
.cz-pets.cz-teach .cz-chip:first-child{animation:czTeach .7s infinite alternate;outline:3px solid #3effa0;outline-offset:2px}
.cz-pets.cz-teach .cz-chip:first-child::after{content:'';position:absolute;left:52px;top:14px;border:10px solid transparent;border-right:14px solid #3effa0;filter:drop-shadow(0 2px 0 #2a0b5c)}
@keyframes czTeach{to{transform:translateX(4px) scale(1.06)}}
.cz-cmd{position:absolute;left:calc(env(safe-area-inset-left,0px) + 62px);top:calc(env(safe-area-inset-top,0px) + 112px);background:#fffbe8;border:3px solid #2a0b5c;border-radius:16px;box-shadow:0 4px 0 #2a0b5c;padding:6px;pointer-events:auto;color:#2a0b5c;z-index:9;animation:czToastIn .2s}
.cz-cmdh{font-size:12px;font-weight:700;padding:0 4px 4px}
.cz-cmdg{display:grid;grid-template-columns:repeat(3,64px);gap:5px}
.cz-cmdb{font:inherit;border:2px solid #2a0b5c;border-radius:12px;background:#fff;color:#2a0b5c;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 2px 3px;font-size:11px;font-weight:700;line-height:1.05;min-height:54px;cursor:pointer;touch-action:manipulation}
.cz-cmdb canvas{width:30px;height:30px}
.cz-cmdb:active{background:#ffe14a}
.cz-cmdb.cz-dim{opacity:.45}
.cz-cmdb.cz-sm{background:#efe6ff}
.cz-ministars{display:inline-flex;gap:0;vertical-align:middle}
.cz-ministars i{display:inline-flex;filter:grayscale(1) brightness(.55);opacity:.7}
.cz-ministars i.on{filter:none;opacity:1}
.cz-goal{padding:2px 10px 2px 6px;font-size:14px}
.cz-mapov{gap:8px;padding-top:calc(env(safe-area-inset-top,0px) + 8px)}
.cz-maptop{display:flex;align-items:center;gap:6px;width:min(760px,100%)}
.cz-maptop .cz-title{font-size:26px;text-align:left}
.cz-maptop .cz-grow{flex:1}
.cz-modesrow{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:min(760px,100%)}
.cz-modesrow .cz-btn{font-size:15px;padding:8px 12px}
.cz-modesrow.cz-small .cz-btn{font-size:13px;padding:6px 10px;background:linear-gradient(#5d4a9e,#3b2a7a)}
.cz-modesrow.cz-small .cz-btn.cz-gold{background:linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00)}
.cz-toggle .cz-chk{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:#fff;color:#17994a;border:2px solid #2a0b5c}
.cz-modesrow.cz-small .cz-toggle.cz-on{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.cz-worlds{display:flex;flex-direction:column;gap:10px;width:min(760px,100%)}
.cz-world{border-radius:18px;padding:8px;background:linear-gradient(135deg,var(--w1),var(--w2));border:3px solid #2a0b5c;box-shadow:0 4px 0 #150533}
.cz-wh{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.cz-wh b{font-size:17px;color:#fff;-webkit-text-stroke:3px #2a0b5c;paint-order:stroke fill}
.cz-lvgrid{display:flex;flex-wrap:wrap;gap:7px}
.cz-lvb{pointer-events:auto;position:relative;width:58px;height:58px;border-radius:50%;border:3px solid #2a0b5c;background:radial-gradient(circle at 40% 30%,#fff,#ffe1b8);color:#2a0b5c;font:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 0 #2a0b5c;cursor:pointer;padding:0}
.cz-lvb b{font-size:20px;line-height:1}
.cz-lvb .cz-ministars{margin-top:1px}
.cz-lvb.cz-done{background:radial-gradient(circle at 40% 30%,#fffbe0,#ffd84a)}
.cz-lvb.cz-next{background:radial-gradient(circle at 40% 30%,#e0ffe8,#3ee07a);animation:czPulse .6s infinite alternate}
.cz-lvb.cz-lock{background:#8a82a8;opacity:.75;box-shadow:0 2px 0 #2a0b5c}
.cz-lvb em{position:absolute;right:-6px;top:-6px;background:#fff;border:2px solid #2a0b5c;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center}
.cz-sheet{position:absolute;inset:0;background:rgba(20,8,50,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:20;animation:czFade .2s;padding:10px}
.cz-sheet .cz-card{max-height:96%;overflow-y:auto}
.cz-sheett{font-size:20px}
.cz-new{background:#3ee07a!important;color:#0b3a1e;font-weight:700}
.cz-newrow{background:#3ee07a;color:#0b3a1e;border-radius:10px;padding:3px 10px;font-weight:700;font-size:13px;text-align:center}
.cz-goals{display:flex;justify-content:space-around;gap:4px;font-size:13px;font-weight:700}
.cz-goals span{display:inline-flex;align-items:center;gap:3px;opacity:.85}
.cz-goals span.on{color:#ffe14a;opacity:1}
@media (orientation:landscape) and (max-height:500px){
  .cz-title{font-size:26px}
  .cz-ov{gap:8px}
  .cz-do{width:92px;height:92px}
  .cz-pick{width:70px;height:70px}
  .cz-emo{bottom:calc(env(safe-area-inset-bottom,0px) + 18px);right:auto;left:calc(env(safe-area-inset-left,0px) + 12px)}
}
`;
let done = false;
export function injectCzCss(): void {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'cz-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}
