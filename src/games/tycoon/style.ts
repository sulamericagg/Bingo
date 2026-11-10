/* CSS próprio da Fábrica Estelar (injetado uma vez; prefixo .ty-). */
const CSS = `
.ty-root{position:absolute;inset:0;overflow:hidden;background:#20104a;font-family:Fredoka,system-ui,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;z-index:50}
.ty-root canvas.ty-cv{position:absolute;left:0;top:0;display:block;touch-action:none}
.ty-hud{position:absolute;inset:0;pointer-events:none;padding:calc(env(safe-area-inset-top,0px) + 8px) var(--edge-r,10px) var(--edge-b,10px) var(--edge-l,10px)}
.ty-top{display:flex;align-items:center;gap:8px}
.ty-btn{pointer-events:auto;border:0;cursor:pointer;font:inherit;color:#fff;background:linear-gradient(#8a5cff,#5326cc);box-shadow:0 3px 0 #2a0b5c,inset 0 2px 0 rgba(255,255,255,.35);border-radius:14px;padding:6px 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700}
.ty-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #2a0b5c}
.ty-btn.ty-ic{width:42px;height:42px;padding:0}
.ty-btn.ty-gold{background:linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00);color:#2a0b5c}
.ty-btn.ty-green{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.ty-btn.ty-pink{background:linear-gradient(#ffc7ee,#ff5cc8 50%,#c9268a)}
.ty-btn[disabled]{filter:grayscale(.8) brightness(.8);pointer-events:none}
.ty-pill{background:rgba(42,11,92,.82);border:2px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 12px 4px 6px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:18px;white-space:nowrap}
.ty-timer{margin-left:auto}
.ty-timer.ty-hurry{background:#c21d3c;animation:tyPulse .6s infinite alternate}
@keyframes tyPulse{to{transform:scale(1.08)}}
.ty-wallet{font-size:20px}
.ty-rank{position:absolute;right:var(--edge-r,10px);top:calc(env(safe-area-inset-top,0px) + 58px);display:flex;flex-direction:column;gap:3px;width:132px;opacity:.88;pointer-events:none}
.ty-row{display:flex;align-items:center;gap:5px;background:rgba(42,11,92,.6);border-radius:10px;padding:1px 7px 1px 4px;font-size:12px;font-weight:600;position:relative;overflow:hidden;transition:transform .3s}
.ty-row.ty-me{background:rgba(255,207,46,.92);color:#2a0b5c}
.ty-row b{width:16px;text-align:center}
.ty-row .ty-dot{width:10px;height:10px;border-radius:50%;border:2px solid #2a0b5c;flex:none}
.ty-row .ty-nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ty-row .ty-bar{position:absolute;left:0;bottom:0;height:3px;background:#3ee07a}
.ty-hint{position:absolute;left:var(--edge-l,10px);right:calc(var(--edge-r,10px) + 158px);top:calc(env(safe-area-inset-top,0px) + 60px);background:rgba(42,11,92,.88);padding:7px 10px;border-radius:14px;font-size:14px;font-weight:600;line-height:1.2;transition:opacity .4s;border:2px solid rgba(255,255,255,.18)}
.ty-banner{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 17%);text-align:center;font-size:30px;font-weight:700;color:#fff36b;-webkit-text-stroke:3px #2a0b5c;paint-order:stroke fill;text-shadow:0 4px 0 #2a0b5c;pointer-events:none;animation:tyPop .5s cubic-bezier(.3,1.6,.6,1)}
@keyframes tyPop{from{transform:scale(.3);opacity:0}}
.ty-joy{position:absolute;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;background:rgba(255,255,255,.14);border:3px solid rgba(255,255,255,.35);pointer-events:none;display:none}
.ty-joy i{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(255,255,255,.7)}
.ty-ov{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,rgba(62,224,122,.25),rgba(20,8,50,.92) 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;pointer-events:auto;animation:tyFade .3s}
@keyframes tyFade{from{opacity:0}}
.ty-title{font-size:32px;font-weight:700;color:#fff36b;-webkit-text-stroke:3px #2a0b5c;paint-order:stroke fill;text-shadow:0 3px 0 #2a0b5c;text-align:center;line-height:1.05}
.ty-sub{font-size:15px;opacity:.9;text-align:center;max-width:320px}
.ty-card{width:min(340px,92vw);background:linear-gradient(#3b2a7a,#2a1a60);border:3px solid #2a0b5c;border-radius:20px;padding:14px;box-shadow:0 6px 0 #150533;display:flex;flex-direction:column;gap:10px}
.ty-big{font-size:20px;padding:12px 16px;border-radius:18px;width:100%}
.ty-seg{display:flex;gap:6px}
.ty-seg .ty-btn{flex:1;font-size:14px;padding:8px 4px;background:linear-gradient(#5d4a9e,#3b2a7a)}
.ty-seg .ty-btn.on{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.ty-badge{background:#ff4f6a;color:#fff;border-radius:999px;padding:1px 8px;font-size:13px;margin-left:4px;border:2px solid #2a0b5c}
.ty-pod{display:flex;align-items:flex-end;justify-content:center;gap:6px;height:230px;width:min(360px,94vw)}
.ty-step{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
.ty-step canvas{margin-bottom:-6px}
.ty-block{width:100%;border:3px solid #2a0b5c;border-radius:12px 12px 4px 4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:6px;font-weight:700;animation:tyRise .6s cubic-bezier(.3,1.4,.6,1) both}
@keyframes tyRise{from{transform:scaleY(0);transform-origin:bottom}}
.ty-block b{font-size:30px;color:#fff;-webkit-text-stroke:3px #2a0b5c;paint-order:stroke fill}
.ty-block small{font-size:12px;color:#2a0b5c;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px}
.ty-list{width:min(340px,92vw);display:flex;flex-direction:column;gap:4px}
.ty-list .ty-row{font-size:15px;padding:5px 10px}
.ty-reward{display:flex;align-items:center;justify-content:center;gap:8px;font-size:26px;font-weight:700;color:#fff36b}
.ty-actions{display:flex;gap:8px;width:min(340px,92vw)}
.ty-actions .ty-btn{flex:1;padding:12px 8px;font-size:17px}
.ty-idle{position:absolute;left:0;right:0;bottom:0;pointer-events:auto;padding:10px var(--edge-r,10px) var(--edge-b,10px) var(--edge-l,10px);background:linear-gradient(rgba(20,8,50,0),rgba(20,8,50,.9) 22%);display:flex;flex-direction:column;gap:8px;align-items:center}
.ty-idle .ty-card{gap:8px;padding:10px 12px}
.ty-meter{height:12px;border-radius:999px;background:rgba(0,0,0,.35);overflow:hidden;border:2px solid #2a0b5c}
.ty-meter i{display:block;height:100%;background:linear-gradient(90deg,#3ee07a,#ffcf2e)}
.ty-upg{display:flex;align-items:center;gap:8px;font-size:14px}
.ty-upg .ty-n{flex:1;line-height:1.1}
.ty-upg .ty-n small{display:block;opacity:.75;font-size:12px}
.ty-upg .ty-btn{min-width:92px;font-size:14px;padding:6px 8px}
.ty-lv{display:flex;gap:2px;margin-top:2px}
.ty-lv i{width:8px;height:5px;border-radius:2px;background:rgba(255,255,255,.2)}
.ty-lv i.on{background:#ffcf2e}
@media (max-height:680px){.ty-pod{height:180px}.ty-title{font-size:26px}.ty-rank{width:132px}.ty-row{font-size:12px}}
`;
let done = false;
export function injectTycoonCss(): void {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'ty-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}
