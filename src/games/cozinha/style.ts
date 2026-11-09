/* CSS próprio da Cozinha Maluca (injetado uma vez; prefixo .cz-). */
const CSS = `
.cz-root{position:absolute;inset:0;overflow:hidden;background:#ff8a7a;font-family:var(--font,Fredoka,system-ui,sans-serif);color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;z-index:50}
.cz-root canvas.cz-cv{position:absolute;left:0;top:0;display:block;touch-action:none}
.cz-hud{position:absolute;inset:0;pointer-events:none}
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
.cz-joy{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;background:rgba(42,11,92,.25);border:3px solid rgba(255,255,255,.45);pointer-events:none}
.cz-joy i{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(255,255,255,.85);border:3px solid #2a0b5c}
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
