/* CSS do Pintou, Ganhou! (injetado uma vez; prefixo .pg-). */
const CSS = `
.pg-root{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 0%,#5b3aa8,#2a1460 60%,#1a0b40);font-family:var(--font,Fredoka,system-ui,sans-serif);color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;z-index:50;-webkit-tap-highlight-color:transparent}
.pg-root *{box-sizing:border-box}
.pg-root button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
.pg-btn{pointer-events:auto;border:0;cursor:pointer;color:#fff;background:linear-gradient(#8a5cff,#5326cc);box-shadow:0 3px 0 #1d0b48,inset 0 2px 0 rgba(255,255,255,.35);border-radius:14px;padding:9px 14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:16px;line-height:1.1;touch-action:manipulation}
.pg-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #1d0b48}
.pg-btn.pg-gold{background:linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00);color:#2a0b5c}
.pg-btn.pg-green{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.pg-btn.pg-pink{background:linear-gradient(#ffc7ee,#ff5cc8 50%,#c9268a)}
.pg-btn.pg-ghost{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)}
.pg-btn.pg-ic{width:42px;height:42px;padding:0;border-radius:13px}
.pg-btn[disabled]{filter:grayscale(.8) brightness(.75);pointer-events:none}
.pg-big{font-size:21px;padding:13px 18px;border-radius:18px;width:100%}
.pg-ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 14px) 14px calc(env(safe-area-inset-bottom,0px) + 16px);overflow-y:auto;animation:pgFade .22s;z-index:5}
.pg-ov>*{flex-shrink:0}
.pg-ov{touch-action:pan-y}
.pg-ov.pg-dim{background:rgba(20,8,48,.86);backdrop-filter:blur(2px)}
.pg-ov.pg-center{justify-content:center}
@keyframes pgFade{from{opacity:0}}
.pg-logo{font-size:40px;font-weight:700;line-height:.95;text-align:center;margin-top:6px;letter-spacing:.5px}
.pg-logo span{display:inline-block;-webkit-text-stroke:4px #1d0b48;paint-order:stroke fill;text-shadow:0 4px 0 #1d0b48;animation:pgBob 2.4s ease-in-out infinite}
@keyframes pgBob{50%{transform:translateY(-4px) rotate(-2deg)}}
.pg-sub{font-size:15px;opacity:.9;text-align:center;max-width:380px;line-height:1.25}
.pg-card{width:min(400px,100%);background:linear-gradient(#3e2a86,#2a1a64);border:3px solid #1d0b48;border-radius:20px;padding:12px;box-shadow:0 6px 0 #10052c;display:flex;flex-direction:column;gap:9px}
.pg-mode{display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px;border-radius:18px;border:3px solid #1d0b48;box-shadow:0 4px 0 #10052c;cursor:pointer;width:100%;color:#fff}
.pg-mode:active{transform:translateY(2px);box-shadow:0 2px 0 #10052c}
.pg-mode b{display:block;font-size:20px}
.pg-mode small{display:block;font-size:13px;opacity:.9;line-height:1.2}
.pg-mode .pg-mi{flex:0 0 52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18)}
.pg-m1{background:linear-gradient(135deg,#ff5e8a,#ff9a3d)}
.pg-m2{background:linear-gradient(135deg,#2fb7b0,#3a7ae0)}
.pg-m3{background:linear-gradient(135deg,#8a5cff,#d84ac8)}
.pg-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.pg-grow{flex:1}
.pg-pill{background:rgba(16,5,44,.6);border:2px solid rgba(255,255,255,.16);border-radius:999px;padding:3px 11px 3px 7px;display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:15px;white-space:nowrap}
.pg-xp{width:100%;height:10px;border-radius:6px;background:rgba(0,0,0,.35);overflow:hidden}
.pg-xp i{display:block;height:100%;background:linear-gradient(90deg,#ffd166,#ff7a45);border-radius:6px}
.pg-lbl{font-size:13px;opacity:.85;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.pg-seg{display:flex;background:rgba(0,0,0,.28);border-radius:14px;padding:3px;gap:3px;width:100%}
.pg-seg button{flex:1;border:0;background:transparent;border-radius:11px;padding:8px 4px;font-weight:700;font-size:15px;cursor:pointer}
.pg-seg button.on{background:#ffd166;color:#2a0b5c;box-shadow:0 2px 0 #b07a10}
.pg-step{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.pg-line{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pg-line>.pg-lbl{flex:1;min-width:0}
.pg-step b{min-width:28px;text-align:center;font-size:22px}
.pg-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:rgba(0,0,0,.22);border:0;border-radius:14px;padding:9px 12px;font-weight:700;font-size:15px;cursor:pointer;text-align:left}
.pg-tog i{flex:0 0 46px;height:26px;border-radius:13px;background:#5a4a80;position:relative;transition:background .2s}
.pg-tog i::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}
.pg-tog.on i{background:#3ee07a}
.pg-tog.on i::after{transform:translateX(20px)}
.pg-tog small{display:block;font-weight:400;opacity:.8;font-size:12px}
.pg-chips{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;width:100%;padding-bottom:4px;scrollbar-width:none;touch-action:pan-x}
.pg-chips::-webkit-scrollbar{display:none}
.pg-chips button{flex:0 0 auto;border:0;border-radius:999px;padding:6px 12px;background:rgba(255,255,255,.12);font-weight:700;font-size:14px;cursor:pointer;white-space:nowrap}
.pg-chips button.on{background:#ffd166;color:#2a0b5c}
.pg-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 58px);transform:translateX(-50%);background:rgba(16,5,44,.92);border:2px solid rgba(255,255,255,.2);border-radius:14px;padding:7px 14px;font-weight:700;font-size:15px;white-space:nowrap;pointer-events:none;z-index:20;animation:pgToast 1.9s ease forwards}
@keyframes pgToast{0%{opacity:0;transform:translate(-50%,-10px) scale(.9)}10%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-8px)}}
/* ---------- partida ---------- */
.pg-play{position:absolute;inset:0;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 6px) calc(env(safe-area-inset-right,0px) + 8px) calc(env(safe-area-inset-bottom,0px) + 8px) calc(env(safe-area-inset-left,0px) + 8px);gap:6px}
.pg-left{display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;min-width:0}
.pg-top{display:flex;align-items:center;gap:6px}
.pg-top .pg-pill{font-size:14px}
.pg-tbar{flex:1;height:12px;border-radius:7px;background:rgba(0,0,0,.35);overflow:hidden;min-width:40px}
.pg-tbar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#3ee07a,#ffd166);border-radius:7px;transform-origin:left}
.pg-tbar.pg-hurry i{background:linear-gradient(90deg,#ff4f6a,#ff9a3d)}
.pg-players{display:flex;gap:5px;overflow:hidden;flex-wrap:nowrap}
.pg-pl{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:5px;background:rgba(16,5,44,.5);border-radius:12px;padding:3px 7px 3px 4px;font-size:13px;font-weight:700;border:2px solid transparent;white-space:nowrap}
.pg-pl.me{border-color:#ffd166}
.pg-pl i{flex:0 0 18px;height:18px;border-radius:50%;border:2px solid #fff}
.pg-pl span{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.pg-pl em{font-style:normal;opacity:.9}
.pg-pl.done::after{content:'✓';color:#3ee07a;font-size:15px}
.pg-stage{position:relative;flex:1;min-height:120px;border-radius:20px;overflow:hidden;background:#c9c7cf;border:3px solid #1d0b48;box-shadow:0 5px 0 #10052c}
.pg-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pg-iname{position:absolute;left:0;right:0;bottom:8px;text-align:center;color:#2b2140;font-weight:700;font-size:19px;padding:0 10px;line-height:1.1;pointer-events:none;text-shadow:0 1px 0 rgba(255,255,255,.6)}
.pg-iname small{display:block;font-size:12px;opacity:.7;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.pg-phase{position:absolute;left:50%;top:8px;transform:translateX(-50%);background:#2b2140;color:#fff;border-radius:999px;padding:3px 12px;font-weight:700;font-size:14px;white-space:nowrap;pointer-events:none}
.pg-phase.pg-mem{background:#ff5e8a}
.pg-hint{position:absolute;left:8px;right:8px;top:38px;text-align:center;color:#2b2140;font-weight:700;font-size:13px;pointer-events:none;opacity:.85}
.pg-dock{flex:0 0 auto;display:flex;justify-content:center}
/* seletor */
.pg-picker{display:grid;grid-template-columns:auto 1fr;grid-template-areas:'main side' 'quick quick' 'act act';gap:7px 10px;align-items:center;width:100%;max-width:560px}
.pg-picker.pg-locked .pg-pk-main,.pg-picker.pg-locked .pg-quick,.pg-picker.pg-locked .pg-nudges{opacity:.45;pointer-events:none}
.pg-pk-main{grid-area:main;position:relative;touch-action:none}
.pg-pk-cv{display:block;touch-action:none;cursor:crosshair}
.pg-loupe{position:absolute;left:0;top:0;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 2px #2b2140,0 8px 18px rgba(0,0,0,.45);pointer-events:none;opacity:0;transition:opacity .12s;z-index:4}
.pg-loupe.on{opacity:1}
.pg-pk-side{grid-area:side;display:flex;flex-direction:column;gap:7px;min-width:0;align-self:stretch;justify-content:center}
.pg-pk-sw{height:54px;border-radius:14px;border:3px solid #fff;box-shadow:0 0 0 2px #1d0b48,0 4px 0 #10052c;flex:0 0 auto}
.pg-nudges{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.pg-nudges button{border:0;border-radius:12px;background:rgba(255,255,255,.14);padding:7px 4px;font-weight:700;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;touch-action:none}
.pg-nudges button:active{background:rgba(255,255,255,.3)}
.pg-nudges i{display:block;width:30px;height:9px;border-radius:5px;border:1px solid rgba(255,255,255,.5)}
.pg-ni-viv{background:linear-gradient(90deg,#9a8a9a,#ff2a8a)}
.pg-ni-mut{background:linear-gradient(90deg,#ff2a8a,#9a8a9a)}
.pg-quick{grid-area:quick;display:grid;grid-template-columns:repeat(12,1fr);gap:5px}
.pg-quick button{aspect-ratio:1;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #1d0b48;cursor:pointer;padding:0;min-width:0}
.pg-quick button:active{transform:scale(.88)}
.pg-pk-act{grid-area:act;display:flex;gap:8px}
.pg-land .pg-play{flex-direction:row}
.pg-land .pg-dock{align-items:center}
.pg-land .pg-picker{grid-template-columns:auto 156px;grid-template-areas:'main side' 'main quick' 'main act';max-width:none;width:auto;gap:6px 10px}
.pg-land .pg-quick{grid-template-columns:repeat(6,1fr);gap:4px}
.pg-land .pg-pk-sw{height:40px}
.pg-land .pg-nudges button{padding:4px 3px;font-size:12px}
.pg-ready{flex:1;font-size:20px;padding:11px 12px}
/* revelação */
.pg-rev{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center}
.pg-pct{font-size:58px;font-weight:700;line-height:1;-webkit-text-stroke:5px #1d0b48;paint-order:stroke fill;text-shadow:0 4px 0 #1d0b48;animation:pgPop .45s cubic-bezier(.3,1.7,.5,1)}
.pg-pct small{font-size:.5em}
@keyframes pgPop{from{transform:scale(.3);opacity:0}}
.pg-de{background:rgba(29,11,72,.85);border-radius:999px;padding:3px 12px;font-size:14px;font-weight:700;margin-top:6px}
.pg-stars{font-size:34px;letter-spacing:2px;height:40px;margin-top:2px;color:#ffd166;-webkit-text-stroke:2px #1d0b48;paint-order:stroke fill}
.pg-stars i{font-style:normal;display:inline-block;animation:pgStar .4s cubic-bezier(.3,1.8,.5,1) both}
.pg-stars i.off{color:rgba(255,255,255,.35)}
@keyframes pgStar{from{transform:scale(0) rotate(-90deg)}}
.pg-fb{background:#fff;color:#2b2140;border-radius:12px;padding:4px 10px;font-weight:700;font-size:14px;margin-top:6px;box-shadow:0 3px 0 rgba(0,0,0,.25);max-width:92%;text-align:center}
.pg-revside{position:absolute;top:8px;font-weight:700;font-size:13px;background:rgba(29,11,72,.85);border-radius:999px;padding:2px 10px;text-transform:uppercase;letter-spacing:.5px}
.pg-rank{display:flex;flex-direction:column;gap:5px;width:100%}
.pg-rank div{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.25);border-radius:12px;padding:5px 9px;font-weight:700;font-size:15px}
.pg-rank div.me{box-shadow:inset 0 0 0 2px #ffd166}
.pg-rank div i{flex:0 0 26px;height:26px;border-radius:8px;border:2px solid #fff}
.pg-rank div span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pg-rank div b{font-size:17px}
.pg-rank div em{font-style:normal;opacity:.75;font-size:13px}
.pg-podium{display:flex;align-items:flex-end;justify-content:center;gap:8px;height:150px;width:100%}
.pg-podium div{width:30%;max-width:110px;border-radius:14px 14px 4px 4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:6px;font-weight:700;border:3px solid #1d0b48;animation:pgRise .6s cubic-bezier(.3,1.4,.5,1) both}
.pg-podium div i{width:34px;height:34px;border-radius:50%;border:3px solid #fff;margin-top:-26px}
.pg-podium div span{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px}
.pg-podium div b{font-size:24px}
@keyframes pgRise{from{transform:scaleY(0);transform-origin:bottom}}
.pg-album{width:min(560px,100%);border-radius:16px;background:#c9c7cf;border:3px solid #1d0b48;display:block}
.pg-confetti{position:absolute;inset:0;pointer-events:none;z-index:30}
.pg-hand{font-size:24px;font-weight:700;text-align:center}
.pg-lb{width:100%;display:flex;flex-direction:column;gap:4px}
.pg-lb div{display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.22);border-radius:10px;padding:6px 10px;font-weight:700}
.pg-lb div b{width:24px;opacity:.8}
.pg-lb div span{flex:1}
.pg-lb div em{font-style:normal;opacity:.7;font-size:13px}
.pg-modes{width:min(400px,100%);display:flex;flex-direction:column;gap:10px}
.pg-bottom{width:min(400px,100%)}
.pg-bottom .pg-tog{flex:1 1 100%}
.pg-land .pg-modes{flex-direction:row;width:min(860px,100%)}
.pg-land .pg-modes .pg-mode{flex:1;flex-direction:column;text-align:center;gap:6px}
.pg-land .pg-bottom{width:min(860px,100%);flex-wrap:nowrap}
.pg-land .pg-bottom .pg-tog{flex:1 1 auto}
.pg-land .pg-logo{font-size:30px;margin-top:0}
.pg-land .pg-hide-land{display:none}
.pg-land .pg-pl span{display:none}
.pg-land .pg-pl{justify-content:center}
@media (max-height:640px){.pg-logo{font-size:32px}.pg-mode{padding:8px 12px}.pg-mode b{font-size:18px}}
`;
let done = false;
export function injectPgCss(): void {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}
