/* CSS do Bloop no Lugar (injetado uma vez; prefixo .lg-). Paleta roxo/rosa do hub. */
const CSS = `
.lg-root{position:absolute;inset:0;overflow:hidden;background:radial-gradient(120% 70% at 50% 0%,#6a3cc8 0%,#3a1590 45%,#1a0846 100%);font-family:var(--font,Fredoka,system-ui,sans-serif);color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;z-index:50;-webkit-tap-highlight-color:transparent}
.lg-root::before{content:'';position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.13) 1.2px,transparent 1.6px);background-size:24px 24px;mask-image:linear-gradient(180deg,#000,transparent 70%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 70%);pointer-events:none}
.lg-root *{box-sizing:border-box}
.lg-root button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.lg-btn{pointer-events:auto;border:3px solid #1d0b48;cursor:pointer;color:#fff;background:linear-gradient(#9a6bff,#6334e0);box-shadow:0 4px 0 #1d0b48,inset 0 2px 0 rgba(255,255,255,.35);border-radius:16px;padding:9px 14px;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;font-size:16px;line-height:1.1;min-height:48px;transition:transform .07s}
.lg-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #1d0b48}
.lg-btn.lg-gold{background:linear-gradient(#fff3a0,#ffcf2e 50%,#f09a00);color:#2a0b5c}
.lg-btn.lg-green{background:linear-gradient(#c9ffdc,#3ee07a 50%,#17994a);color:#0b3a1e}
.lg-btn.lg-pink{background:linear-gradient(#ffc7ee,#ff5cc8 50%,#c9268a)}
.lg-btn.lg-ghost{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.22);box-shadow:none}
.lg-btn.lg-ic{width:48px;height:48px;padding:0;border-radius:15px;flex:none}
.lg-btn.lg-ghostic{visibility:hidden}
.lg-btn[disabled]{filter:grayscale(.85) brightness(.7);pointer-events:none}
.lg-big{font-size:21px;padding:12px 18px;border-radius:20px;width:100%;min-height:58px}
.lg-grow{flex:1}
.lg-row{display:flex;gap:8px;align-items:center;justify-content:center;width:100%}
.lg-ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px calc(env(safe-area-inset-bottom,0px) + 18px);overflow-y:auto;touch-action:pan-y;animation:lgFade .22s;z-index:5}
.lg-ov>*{flex-shrink:0;max-width:440px}
.lg-ov.lg-center{justify-content:center}
.lg-ov.lg-dim{background:rgba(20,6,52,.8);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);z-index:30}
@keyframes lgFade{from{opacity:0}}
.lg-logo{font-size:44px;font-weight:700;line-height:1;text-align:center;letter-spacing:.5px}
.lg-logo.sm{font-size:30px}
.lg-logo span{display:inline-block;-webkit-text-stroke:5px #1d0b48;paint-order:stroke fill;text-shadow:0 5px 0 #1d0b48;animation:lgBob 2.6s ease-in-out infinite}
.lg-logo i{display:inline-block;width:.25em}
@keyframes lgBob{50%{transform:translateY(-4px) rotate(-3deg)}}
.lg-sub{font-size:16px;opacity:.92;text-align:center;line-height:1.25;max-width:340px}
.lg-hero{height:118px;display:flex;align-items:flex-end;justify-content:center;margin-top:4px;position:relative}
.lg-hero canvas{animation:lgHop 1.6s cubic-bezier(.3,0,.3,1) infinite;transform-origin:50% 90%}
.lg-hero::after{content:'';position:absolute;bottom:4px;left:50%;width:70px;height:12px;margin-left:-35px;border-radius:50%;background:rgba(10,0,30,.35);animation:lgShadow 1.6s cubic-bezier(.3,0,.3,1) infinite;z-index:-1}
@keyframes lgHop{0%,100%{transform:translateY(0) scale(1.08,.92)}15%{transform:translateY(-4px) scale(.94,1.07)}45%{transform:translateY(-22px) scale(1,1)}75%{transform:translateY(-2px) scale(.97,1.03)}}
@keyframes lgShadow{45%{transform:scale(.6);opacity:.5}}
.lg-stats{display:flex;gap:8px;justify-content:center}
.lg-pill{background:rgba(16,5,44,.55);border:2px solid rgba(255,255,255,.16);border-radius:999px;padding:4px 12px 4px 8px;display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:15px;white-space:nowrap}
.lg-play-btn{width:min(440px,100%);justify-content:flex-start;gap:12px;padding-left:18px}
.lg-play-btn span{display:flex;flex-direction:column;align-items:flex-start;text-align:left}
.lg-play-btn b{font-size:24px}
.lg-play-btn small{font-size:14px;opacity:.85;font-weight:600}
.lg-modes{display:flex;gap:10px;width:min(440px,100%)}
.lg-mode{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:12px;border-radius:20px;border:3px solid #1d0b48;box-shadow:0 4px 0 #1d0b48;cursor:pointer;color:#fff;min-height:118px}
.lg-mode:active{transform:translateY(3px);box-shadow:0 1px 0 #1d0b48}
.lg-mode b{display:block;font-size:18px}
.lg-mode small{display:block;font-size:13px;opacity:.92;line-height:1.2}
.lg-mi{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2)}
.lg-m1{background:linear-gradient(140deg,#ff6fae,#ff9a5c)}
.lg-m2{background:linear-gradient(140deg,#3ccfc4,#5b7cff)}
.lg-home .lg-row{width:min(440px,100%)}
.lg-home .lg-ghost{width:min(440px,100%)}
.lg-card{width:min(440px,100%);background:linear-gradient(#4a2fa0,#2e1a72);border:3px solid #1d0b48;border-radius:24px;padding:16px;box-shadow:0 7px 0 #12053a,inset 0 2px 0 rgba(255,255,255,.18);display:flex;flex-direction:column;gap:11px}
.lg-ctitle{display:flex;align-items:center;gap:8px;font-size:22px;font-weight:700}
.lg-p{margin:0;font-size:15px;line-height:1.35;opacity:.95}
.lg-tip{margin:0;font-size:13px;line-height:1.3;opacity:.8}
.lg-lbl{font-size:12.5px;opacity:.8;font-weight:700;text-transform:uppercase;letter-spacing:.7px}
.lg-sizes{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.lg-sizes button,.lg-seg button{border:2px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);border-radius:13px;padding:9px 4px;font-weight:700;font-size:16px;cursor:pointer;min-height:46px}
.lg-sizes button.on,.lg-seg button.on{background:#ffe066;color:#2a0b5c;border-color:#1d0b48;box-shadow:0 3px 0 #1d0b48}
.lg-seg{display:flex;gap:7px}
.lg-seg button{flex:1;display:flex;flex-direction:column;gap:2px;align-items:center}
.lg-seg button small{font-size:11.5px;font-weight:600;opacity:.8}
.lg-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:rgba(0,0,0,.22);border:0;border-radius:15px;padding:10px 12px;font-weight:700;font-size:16px;cursor:pointer;text-align:left;min-height:52px}
.lg-tog i{flex:0 0 48px;height:28px;border-radius:14px;background:#5a4a80;position:relative;transition:background .2s}
.lg-tog i::after{content:'';position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.lg-tog.on i{background:#3ee07a}
.lg-tog.on i::after{transform:translateX(20px)}
.lg-tog small{display:block;font-weight:500;opacity:.78;font-size:12.5px;margin-top:1px}
.lg-tog.locked{opacity:.75}
.lg-loading{display:flex;gap:10px}
.lg-loading i{width:18px;height:18px;border-radius:50%;background:#ff9ec4;border:3px solid #1d0b48;animation:lgDot .9s ease-in-out infinite}
.lg-loading i:nth-child(2){background:#ffe066;animation-delay:.15s}
.lg-loading i:nth-child(3){background:#8fd6ff;animation-delay:.3s}
@keyframes lgDot{50%{transform:translateY(-14px)}}
/* ---------- mapa ---------- */
.lg-maphead{display:flex;align-items:center;gap:10px;width:min(440px,100%)}
.lg-chtitle{flex:1;text-align:center;display:flex;flex-direction:column}
.lg-chtitle b{font-size:26px;-webkit-text-stroke:4px #1d0b48;paint-order:stroke fill}
.lg-chtitle small{font-size:14px;opacity:.88;display:inline-flex;gap:4px;align-items:center;justify-content:center}
.lg-mapwrap{width:min(440px,100%);border-radius:26px;border:3px solid #1d0b48;box-shadow:0 7px 0 #12053a;padding:18px 12px;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.35),transparent 50%),linear-gradient(160deg,var(--chc),var(--chd))}
.lg-map{display:grid;grid-template-columns:repeat(4,1fr);gap:16px 8px;position:relative}
.lg-root .lg-node{justify-self:center;width:62px;height:62px;border-radius:50%;border:3px solid #1d0b48;background:#fff;color:#2a0b5c;font-weight:700;font-size:21px;box-shadow:0 4px 0 #1d0b48;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer;padding:0}
.lg-root .lg-node:active{transform:translateY(3px);box-shadow:0 1px 0 #1d0b48}
.lg-root .lg-node.done{background:linear-gradient(#fff6c0,#ffd84a)}
.lg-root .lg-node.cur{background:linear-gradient(#ffc7ee,#ff5cc8);color:#fff;-webkit-text-stroke:3px #1d0b48;paint-order:stroke fill;animation:lgPulse 1.3s ease-in-out infinite}
.lg-root .lg-node.locked{background:rgba(255,255,255,.45);color:#5a4a80}
@keyframes lgPulse{50%{transform:scale(1.1)}}
.lg-nstars{position:absolute;bottom:-9px;display:flex;gap:1px}
.lg-nstars i{width:13px;height:13px;background:#5a4a80;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);}
.lg-nstars i.on{background:#ffcf2e}
.lg-chnav{width:min(440px,100%)}
.lg-mapov{justify-content:center}
.lg-node .lg-me{position:absolute;bottom:52px;left:50%;transform:translateX(-50%);pointer-events:none;animation:lgHop 1.6s cubic-bezier(.3,0,.3,1) infinite}
.lg-map::before{content:'';position:absolute;inset:31px 12%;border:5px dashed rgba(255,255,255,.55);border-radius:40px;pointer-events:none}
.lg-regs{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;max-width:100%}
.lg-regs i{width:16px;height:16px;border-radius:6px;border:2.5px solid #1d0b48;opacity:.45;transform:scale(.85);transition:transform .25s cubic-bezier(.2,1.6,.4,1),opacity .2s}
.lg-regs i.on{opacity:1;transform:scale(1.1);box-shadow:0 0 0 2px rgba(255,255,255,.7)}
/* ---------- partida ---------- */
.lg-play{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 8px) calc(env(safe-area-inset-right,0px) + 10px) calc(env(safe-area-inset-bottom,0px) + 10px) calc(env(safe-area-inset-left,0px) + 10px);gap:6px}
.lg-top{display:flex;align-items:center;gap:10px;width:100%;max-width:760px}
.lg-ttl{flex:1;display:flex;flex-direction:column;align-items:center;line-height:1.1}
.lg-ttl b{font-size:22px;-webkit-text-stroke:4px #1d0b48;paint-order:stroke fill}
.lg-ttl small{font-size:13.5px;opacity:.9;font-weight:600;display:flex;align-items:center;gap:5px}
.lg-dot{width:10px;height:10px;border-radius:50%;display:inline-block;border:2px solid #1d0b48}
.lg-timer{min-width:76px;height:40px;border-radius:13px;background:rgba(16,5,44,.55);border:2px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;gap:5px;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
.lg-hearts{display:flex;gap:6px;align-items:center;justify-content:center;min-height:38px}
.lg-meta{display:flex;flex-direction:column;align-items:center;gap:5px}
.lg-heart{display:inline-flex;filter:drop-shadow(0 2px 0 #1d0b48);transition:transform .2s}
.lg-heart.off{filter:grayscale(1) brightness(.55) drop-shadow(0 2px 0 #1d0b48);transform:scale(.85)}
.lg-heart.lost{animation:lgHeartLost .7s ease}
@keyframes lgHeartLost{0%{transform:scale(1.5);filter:none}30%{transform:scale(1.2) rotate(-14deg)}60%{transform:scale(.8) rotate(10deg)}100%{transform:scale(.85)}}
.lg-inf{font-size:28px;-webkit-text-stroke:4px #1d0b48;paint-order:stroke fill}
.lg-zen{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:14px;opacity:.85}
.lg-timer.zen{opacity:.6}
.lg-stage{flex:1;width:100%;min-height:0;display:flex;align-items:center;justify-content:center}
.lg-canvas{display:block;border-radius:18px;box-shadow:0 8px 0 #12053a,0 14px 30px rgba(0,0,0,.35);touch-action:none}
.lg-tools{display:flex;gap:8px;width:100%;max-width:560px;justify-content:space-between}
.lg-tool{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:0;background:none;cursor:pointer;padding:0;min-height:64px}
.lg-tool span{position:relative;width:56px;height:52px;border-radius:17px;border:3px solid #1d0b48;background:linear-gradient(#9a6bff,#6334e0);box-shadow:0 4px 0 #1d0b48,inset 0 2px 0 rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;transition:transform .07s}
.lg-tool:active span{transform:translateY(3px);box-shadow:0 1px 0 #1d0b48}
.lg-tool small{font-size:12px;font-weight:700;opacity:.9}
.lg-tool[disabled]{opacity:.45;pointer-events:none}
.lg-hinttool span{background:linear-gradient(#fff3a0,#ffcf2e 50%,#f09a00)}
.lg-badge{position:absolute;top:-9px;right:-9px;min-width:24px;height:24px;border-radius:12px;background:#ff4f8b;border:2.5px solid #1d0b48;font-style:normal;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;color:#fff}
.lg-badge.ad{background:#3ee07a;color:#0b3a1e}
.lg-hintcard{flex:none;width:min(560px,100%);background:linear-gradient(#fffaf0,#ffeec4);color:#2a0b5c;border:3px solid #1d0b48;border-radius:22px;box-shadow:0 6px 0 #1d0b48,0 12px 26px rgba(0,0,0,.35);padding:12px 14px;display:flex;flex-direction:column;gap:8px;z-index:12}
.lg-hintcard[hidden]{display:none}
.lg-hintcard.in{animation:lgCardIn .3s cubic-bezier(.2,1.4,.4,1)}
@keyframes lgCardIn{from{transform:translateY(30px) scale(.92);opacity:0}}
.lg-hintcard p{margin:0;font-size:15.5px;line-height:1.35;font-weight:500}
.lg-hhead{display:flex;align-items:center;gap:8px}
.lg-hhead b{flex:1;font-size:18px}
.lg-hico{display:inline-flex;animation:lgWiggle 1.6s ease-in-out infinite}
@keyframes lgWiggle{50%{transform:rotate(12deg) scale(1.1)}}
.lg-x{width:34px;height:34px;border-radius:50%;border:2.5px solid #1d0b48;background:#2a0b5c;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.lg-hintcard .lg-ghost{background:rgba(42,11,92,.1);border-color:rgba(42,11,92,.25);color:#2a0b5c}
.lg-sheet{position:absolute;inset:0;z-index:40;background:rgba(20,6,52,.72);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:16px;animation:lgFade .18s;touch-action:pan-y;overflow-y:auto}
.lg-sheet .lg-card{animation:lgCardPop .28s cubic-bezier(.2,1.4,.4,1);max-height:100%;overflow-y:auto}
@keyframes lgCardPop{from{transform:scale(.88);opacity:0}}
.lg-pstats{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.lg-pstats span{background:rgba(0,0,0,.25);border-radius:999px;padding:5px 12px 5px 8px;display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:15px}
.lg-pstats .lg-coins{background:linear-gradient(#fff3a0,#ffcf2e);color:#2a0b5c;border:2px solid #1d0b48}
/* ---------- vitória ---------- */
.lg-winov{justify-content:flex-end;background:linear-gradient(180deg,transparent 30%,rgba(20,6,52,.7));z-index:30;animation:lgFade .4s}
.lg-wincard{animation:lgCardIn2 .5s cubic-bezier(.2,1.3,.4,1);align-items:stretch}
@keyframes lgCardIn2{from{transform:translateY(120%)}}
.lg-wintitle{text-align:center;font-size:30px;font-weight:700;color:#ffe066;-webkit-text-stroke:5px #1d0b48;paint-order:stroke fill;text-shadow:0 4px 0 #1d0b48}
.lg-stars{display:flex;justify-content:center;gap:10px}
.lg-star{display:flex;flex-direction:column;align-items:center;gap:3px;width:96px;opacity:.35;filter:grayscale(1)}
.lg-star.on{opacity:1;filter:none;animation:lgStar .5s cubic-bezier(.2,1.6,.4,1) both}
.lg-star small{font-size:12.5px;font-weight:700;text-align:center;line-height:1.1}
@keyframes lgStar{from{transform:scale(0) rotate(-40deg);opacity:0}}
/* ---------- sem corações ---------- */
.lg-sadcard{align-items:stretch;text-align:center}
.lg-sadcard .lg-ctitle{justify-content:center}
.lg-sadart{position:relative;height:178px;margin-bottom:-18px;display:flex;align-items:flex-end;justify-content:center}
.lg-sadbloop canvas{animation:lgSad 2.4s ease-in-out infinite;transform-origin:50% 90%}
@keyframes lgSad{50%{transform:scale(1.04,.95) translateY(2px)}}
.lg-cloud{position:absolute;top:14px;z-index:2;left:50%;width:96px;height:34px;margin-left:-48px;background:#b4c0dc;border:3px solid #1d0b48;border-radius:20px;animation:lgCloud 3s ease-in-out infinite}
.lg-cloud::before,.lg-cloud::after{content:'';position:absolute;background:#b4c0dc;border:3px solid #1d0b48;border-bottom:0;border-radius:50% 50% 0 0}
.lg-cloud::before{width:40px;height:26px;left:12px;top:-18px}
.lg-cloud::after{width:30px;height:20px;left:46px;top:-12px}
.lg-cloud i{position:absolute;top:34px;width:4px;height:12px;border-radius:2px;background:#8fd6ff;animation:lgRain .8s linear infinite}
.lg-cloud i:nth-child(1){left:22px}.lg-cloud i:nth-child(2){left:46px;animation-delay:.3s}.lg-cloud i:nth-child(3){left:70px;animation-delay:.55s}
@keyframes lgRain{from{transform:translateY(0);opacity:1}to{transform:translateY(34px);opacity:0}}
@keyframes lgCloud{50%{transform:translateX(6px)}}
.lg-tear{position:absolute;left:calc(50% - 26px);bottom:58px;width:9px;height:13px;background:#8fd6ff;border:2px solid #1d0b48;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;animation:lgTear 1.6s ease-in infinite}
.lg-tear.r{left:calc(50% + 18px);animation-delay:.8s}
@keyframes lgTear{0%{transform:translateY(0) scale(.4);opacity:0}20%{opacity:1;transform:translateY(0) scale(1)}100%{transform:translateY(34px);opacity:0}}
/* ---------- como jogar ---------- */
.lg-how{align-items:stretch}
.lg-howboard{display:flex;justify-content:center}
.lg-rules{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.lg-rules li{display:flex;gap:10px;align-items:center;font-size:15.5px;line-height:1.3}
.lg-rules b{flex:none;width:30px;height:30px;border-radius:50%;background:#ffe066;color:#2a0b5c;border:2.5px solid #1d0b48;display:flex;align-items:center;justify-content:center}
.lg-rules em{font-style:normal;color:#ffe066;font-weight:700}
.lg-ctrls{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.lg-ctrls span{background:rgba(0,0,0,.25);border-radius:10px;padding:5px 9px;font-size:13px;font-weight:600}
/* ---------- tablet ---------- */
@media (min-width:700px){
  .lg-logo{font-size:60px}
  .lg-ov>*{max-width:560px}
  .lg-card,.lg-modes,.lg-play-btn,.lg-home .lg-row,.lg-home .lg-ghost,.lg-maphead,.lg-mapwrap,.lg-chnav{width:min(560px,100%)}
  .lg-root .lg-node{width:78px;height:78px;font-size:25px}
  .lg-map::before{inset:39px 12%}
  .lg-node .lg-me{bottom:68px}
  .lg-regs i{width:20px;height:20px}
  .lg-ttl b{font-size:28px}
  .lg-tool span{width:72px;height:64px}
  .lg-tool small{font-size:14px}
  .lg-hintcard p{font-size:18px}
}
@media (max-height:640px){
  .lg-hero{height:84px}
  .lg-logo{font-size:36px}
  .lg-mode{min-height:96px}
}
`;
let done = false;
export function injectLugarCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.id = 'lg-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
